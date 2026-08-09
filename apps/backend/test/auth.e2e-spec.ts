import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

interface AuthResponseBody {
  accessToken: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const createdEmails: string[] = [];

  const uniqueEmail = () => `e2e-auth-${randomUUID()}@example.com`;
  const password = 'Sup3rSecret!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    jwtService = new JwtService({ secret: process.env.JWT_SECRET });
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.client.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates a user and returns a JWT access token', async () => {
      const email = uniqueEmail();
      createdEmails.push(email);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const body = response.body as AuthResponseBody;
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(0);

      const payload = jwtService.verify<{ email: string }>(body.accessToken);
      expect(payload).toMatchObject({ email });

      const user = await prisma.client.user.findUnique({ where: { email } });
      expect(user).not.toBeNull();
      expect(user?.password).not.toBe(password);
      await expect(bcrypt.compare(password, user!.password)).resolves.toBe(true);
    });

    it('rejects registration when the email is already taken', async () => {
      const email = uniqueEmail();
      createdEmails.push(email);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('returns a JWT access token for valid credentials', async () => {
      const email = uniqueEmail();
      createdEmails.push(email);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      const body = response.body as AuthResponseBody;
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(0);

      const payload = jwtService.verify<{ email: string }>(body.accessToken);
      expect(payload).toMatchObject({ email });
    });

    it('rejects login for an email that is not registered', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: uniqueEmail(), password })
        .expect(401);
    });

    it('rejects login with an incorrect password', async () => {
      const email = uniqueEmail();
      createdEmails.push(email);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    });
  });
});
