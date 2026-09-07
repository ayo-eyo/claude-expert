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

const binaryParser = (
  res: request.Response,
  callback: (err: Error | null, body: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (err: Error) => callback(err, Buffer.alloc(0)));
};

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

  const uploadRecording = async (
    token: string,
    meetingId: string,
    body: Buffer = Buffer.from('fake mp4 bytes'),
    attachment = validAttachment,
  ) => {
    const response = await request(app.getHttpServer())
      .post(`/meetings/${meetingId}/recording`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', body, attachment)
      .expect(201);
    return response.body as RecordingResponseBody;
  };

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

  describe('GET /meetings/:id/recording', () => {
    it('returns the recording metadata for its owner', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      const uploaded = await uploadRecording(owner.token, meeting.id);

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: uploaded.id,
        meetingId: meeting.id,
        originalName: 'standup.mp4',
        mimeType: 'video/mp4',
        status: 'uploaded',
      });
    });

    it('returns 404 when the meeting has no recording', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);

      await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);
    });

    it('returns 404 when the meeting belongs to another user', async () => {
      const owner = await registerUser();
      const stranger = await registerUser();
      const meeting = await createMeeting(owner.token);
      await uploadRecording(owner.token, meeting.id);

      await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);
    });

    it('rejects the request when no token is provided', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);

      await request(app.getHttpServer()).get(`/meetings/${meeting.id}/recording`).expect(401);
    });
  });

  describe('GET /meetings/:id/recording/download', () => {
    it('streams back bytes identical to the uploaded file', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      const bytes = Buffer.from('the-real-recording-payload-ÿ ');
      await uploadRecording(owner.token, meeting.id, bytes, {
        filename: 'weekly review.mp4',
        contentType: 'video/mp4',
      });

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}/recording/download`)
        .set('Authorization', `Bearer ${owner.token}`)
        .buffer(true)
        .parse(binaryParser)
        .expect(200);

      expect(response.headers['content-type']).toContain('video/mp4');
      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="weekly review.mp4"; filename*=UTF-8\'\'weekly%20review.mp4',
      );
      expect(Buffer.compare(response.body as Buffer, bytes)).toBe(0);
    });

    it('percent-encodes apostrophes and non-ASCII in the Content-Disposition filename', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      await uploadRecording(owner.token, meeting.id, Buffer.from('x'), {
        filename: "Team's обзор (v2).mp4",
        contentType: 'video/mp4',
      });

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}/recording/download`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      expect(response.headers['content-disposition']).toBe(
        'attachment; filename="Team\'s _____ (v2).mp4"; ' +
          "filename*=UTF-8''Team%27s%20%D0%BE%D0%B1%D0%B7%D0%BE%D1%80%20%28v2%29.mp4",
      );
    });

    it('returns 404 when the meeting has no recording', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);

      await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}/recording/download`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);
    });

    it('returns 404 when the DB row exists but the file is gone from disk', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      await uploadRecording(owner.token, meeting.id);

      const row = await prisma.client.meetingRecording.findUniqueOrThrow({
        where: { meetingId: meeting.id },
      });
      rmSync(path.join(storageRoot, row.storagePath));

      await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}/recording/download`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);
    });
  });

  describe('DELETE /meetings/:id/recording', () => {
    it('removes the recording row and the file, then 404s on a follow-up GET', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      await uploadRecording(owner.token, meeting.id);
      const before = filesOnDisk();

      await request(app.getHttpServer())
        .delete(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(204);

      expect(filesOnDisk()).toBe(before - 1);
      expect(
        await prisma.client.meetingRecording.findUnique({ where: { meetingId: meeting.id } }),
      ).toBeNull();

      await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);
    });

    it('allows uploading a fresh recording after a delete', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      await uploadRecording(owner.token, meeting.id);

      await request(app.getHttpServer())
        .delete(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(204);

      await uploadRecording(owner.token, meeting.id);
    });

    it('returns 404 when the meeting has no recording', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);

      await request(app.getHttpServer())
        .delete(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);
    });

    it('returns 404 when the meeting belongs to another user', async () => {
      const owner = await registerUser();
      const stranger = await registerUser();
      const meeting = await createMeeting(owner.token);
      await uploadRecording(owner.token, meeting.id);

      await request(app.getHttpServer())
        .delete(`/meetings/${meeting.id}/recording`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);

      expect(
        await prisma.client.meetingRecording.findUnique({ where: { meetingId: meeting.id } }),
      ).not.toBeNull();
    });
  });

  describe('recording field on meeting responses', () => {
    it('is null on GET /meetings and GET /meetings/:id when there is no recording', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);

      const detail = await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(detail.body).toMatchObject({ id: meeting.id, recording: null });

      const list = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      const listed = (list.body as { id: string; recording: unknown }[]).find(
        (m) => m.id === meeting.id,
      );
      expect(listed?.recording).toBeNull();
    });

    it('carries the recording metadata once one is uploaded', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);
      const uploaded = await uploadRecording(owner.token, meeting.id);

      const detail = await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      expect(detail.body).toMatchObject({
        id: meeting.id,
        recording: {
          id: uploaded.id,
          meetingId: meeting.id,
          originalName: 'standup.mp4',
          mimeType: 'video/mp4',
          status: 'uploaded',
        },
      });

      const list = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);
      const listed = (list.body as { id: string; recording: { id: string } | null }[]).find(
        (m) => m.id === meeting.id,
      );
      expect(listed?.recording?.id).toBe(uploaded.id);
    });
  });
});
