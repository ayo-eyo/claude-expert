import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

interface AuthResponseBody {
  accessToken: string;
}

interface MeetingResponseBody {
  id: string;
}

interface RecordingResponseBody {
  id: string;
  meetingId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  uploadedAt: string;
}

describe('Recordings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storageRoot: string;
  const createdEmails: string[] = [];
  const createdMeetingIds: string[] = [];

  const uniqueEmail = () => `e2e-recordings-${randomUUID()}@example.com`;
  const password = 'Sup3rSecret!';
  const validAttachment = {
    filename: 'standup.mp4',
    contentType: 'video/mp4',
  };

  const registerUser = async () => {
    const email = uniqueEmail();
    createdEmails.push(email);

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const { accessToken } = response.body as AuthResponseBody;
    const user = await prisma.client.user.findUniqueOrThrow({ where: { email } });

    return { id: user.id, email, token: accessToken };
  };

  const createMeeting = async (token: string) => {
    const response = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Sprint planning', date: new Date().toISOString(), participants: [] })
      .expect(201);

    const body = response.body as MeetingResponseBody;
    createdMeetingIds.push(body.id);
    return body;
  };

  const filesOnDisk = () => readdirSync(storageRoot).length;

  beforeAll(async () => {
    storageRoot = mkdtempSync(path.join(os.tmpdir(), 'recordings-e2e-'));
    process.env.RECORDINGS_STORAGE_ROOT = storageRoot;
    process.env.RECORDINGS_MAX_BYTES = '1024';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    if (createdMeetingIds.length > 0) {
      await prisma.client.meeting.deleteMany({ where: { id: { in: createdMeetingIds } } });
    }
    if (createdEmails.length > 0) {
      await prisma.client.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await app.close();
    rmSync(storageRoot, { recursive: true, force: true });
  });

  describe('POST /meetings/:id/recording', () => {
    it('uploads a recording and writes the file to disk', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      const before = filesOnDisk();

      const response = await request(app.getHttpServer())
        .post(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .attach('file', Buffer.from('fake mp4 bytes'), validAttachment)
        .expect(201);

      const body = response.body as RecordingResponseBody;
      expect(body).toMatchObject({
        meetingId: meeting.id,
        originalName: 'standup.mp4',
        mimeType: 'video/mp4',
        status: 'uploaded',
      });
      expect(filesOnDisk()).toBe(before + 1);
    });

    it('rejects an unsupported MIME type and leaves no file on disk', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      const before = filesOnDisk();

      await request(app.getHttpServer())
        .post(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .attach('file', Buffer.from('not a video'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(400);

      expect(filesOnDisk()).toBe(before);
    });

    it('rejects a file exceeding the size limit and leaves no file on disk', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      const before = filesOnDisk();

      await request(app.getHttpServer())
        .post(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .attach('file', Buffer.alloc(2048, 1), { filename: 'big.mp4', contentType: 'video/mp4' })
        .expect(413);

      expect(filesOnDisk()).toBe(before);
    });

    it('returns 404 when the meeting belongs to another user', async () => {
      const owner = await registerUser();
      const stranger = await registerUser();
      const meeting = await createMeeting(owner.token);
      const before = filesOnDisk();

      await request(app.getHttpServer())
        .post(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .attach('file', Buffer.from('fake mp4 bytes'), validAttachment)
        .expect(404);

      expect(filesOnDisk()).toBe(before);
    });

    it('rejects the request when no token is provided', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      const before = filesOnDisk();

      await request(app.getHttpServer())
        .post(`/meetings/${meeting.id}/recording`)
        .attach('file', Buffer.from('fake mp4 bytes'), validAttachment)
        .expect(401);

      expect(filesOnDisk()).toBe(before);
    });

    it('returns 409 and removes the second file when a recording already exists', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      const before = filesOnDisk();

      await request(app.getHttpServer())
        .post(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .attach('file', Buffer.from('fake mp4 bytes'), validAttachment)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .attach('file', Buffer.from('fake mp4 bytes again'), {
          filename: 'standup2.mp4',
          contentType: 'video/mp4',
        })
        .expect(409);

      expect(filesOnDisk()).toBe(before + 1);
    });
  });
});
