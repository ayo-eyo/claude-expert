import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { MeetingsModule } from './meetings/meetings.module';
import { PrismaModule } from './prisma/prisma.module';
import { RecordingsModule } from './recordings/recordings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CqrsModule.forRoot(),
    PrismaModule,
    UsersModule,
    AuthModule,
    MeetingsModule,
    RecordingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
