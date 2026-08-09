import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  readonly client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  async onModuleInit() {
    await this.client.$connect();
    this.logger.log('Connected to the database');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
