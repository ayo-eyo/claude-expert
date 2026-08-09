import { randomUUID } from 'node:crypto';
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
  title: string;
  date: string;
  ownerId: string;
  participants: string[];
  createdAt: string;
}

describe('Meetings (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdEmails: string[] = [];
  const createdMeetingIds: string[] = [];

  const uniqueEmail = () => `e2e-meetings-${randomUUID()}@example.com`;
  const password = 'Sup3rSecret!';

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

  const createMeeting = async (
    token: string,
    overrides: Partial<{ title: string; date: string; participants: string[] }> = {},
  ) => {
    const response = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sprint planning',
        date: new Date().toISOString(),
        participants: [],
        ...overrides,
      })
      .expect(201);

    const body = response.body as MeetingResponseBody;
    createdMeetingIds.push(body.id);
    return body;
  };

  beforeAll(async () => {
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
  });

  describe('POST /meetings', () => {
    it('creates a meeting owned by the authenticated user', async () => {
      const owner = await registerUser();
      const participant = await registerUser();
      const date = new Date().toISOString();

      const response = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ title: 'Sprint planning', date, participants: [participant.id] })
        .expect(201);

      const body = response.body as MeetingResponseBody;
      createdMeetingIds.push(body.id);

      expect(body).toMatchObject({
        title: 'Sprint planning',
        ownerId: owner.id,
        participants: [participant.id],
      });
      expect(new Date(body.date).toISOString()).toBe(date);
      expect(typeof body.id).toBe('string');
      expect(typeof body.createdAt).toBe('string');

      const stored = await prisma.client.meeting.findUnique({ where: { id: body.id } });
      expect(stored).not.toBeNull();
      expect(stored?.ownerId).toBe(owner.id);
    });

    it('rejects the request when no token is provided', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .send({ title: 'Sprint planning', date: new Date().toISOString(), participants: [] })
        .expect(401);
    });

    it('rejects a payload without a title', async () => {
      const owner = await registerUser();

      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ date: new Date().toISOString(), participants: [] })
        .expect(400);
    });

    it('rejects a payload referencing a participant that does not exist', async () => {
      const owner = await registerUser();

      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          title: 'Sprint planning',
          date: new Date().toISOString(),
          participants: [randomUUID()],
        })
        .expect(400);
    });
  });

  describe('GET /meetings', () => {
    it("returns only the authenticated user's meetings", async () => {
      const userA = await registerUser();
      const userB = await registerUser();

      const meetingA1 = await createMeeting(userA.token, { title: 'A1' });
      const meetingA2 = await createMeeting(userA.token, { title: 'A2' });
      await createMeeting(userB.token, { title: 'B1' });

      const response = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${userA.token}`)
        .expect(200);

      const body = response.body as MeetingResponseBody[];
      expect(body).toHaveLength(2);
      expect(body.every((meeting) => meeting.ownerId === userA.id)).toBe(true);
      expect(body.map((meeting) => meeting.id).sort()).toEqual([meetingA1.id, meetingA2.id].sort());
    });

    it('rejects the request when no token is provided', async () => {
      await request(app.getHttpServer()).get('/meetings').expect(401);
    });
  });

  describe('GET /meetings/:id', () => {
    it('returns the meeting for its owner', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token, { title: 'One on one' });

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(200);

      const body = response.body as MeetingResponseBody;
      expect(body).toMatchObject({ id: meeting.id, title: 'One on one', ownerId: owner.id });
    });

    it('returns 404 when the meeting does not exist', async () => {
      const owner = await registerUser();

      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .expect(404);
    });

    it('returns 404 when the meeting belongs to another user', async () => {
      const owner = await registerUser();
      const stranger = await registerUser();
      const meeting = await createMeeting(owner.token);

      await request(app.getHttpServer())
        .get(`/meetings/${meeting.id}`)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);
    });

    it('rejects the request when no token is provided', async () => {
      const owner = await registerUser();
      const meeting = await createMeeting(owner.token);

      await request(app.getHttpServer()).get(`/meetings/${meeting.id}`).expect(401);
    });
  });
});
