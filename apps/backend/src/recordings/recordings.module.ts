import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { DEFAULT_MAX_RECORDING_BYTES, RECORDING_MIME_TO_EXTENSION } from './constants';
import { MeetingOwnerGuard } from './guards/meeting-owner.guard';
import { recordingFileFilter } from './recording-file-filter';
import { RecordingsController } from './recordings.controller';
import { RecordingsStorageService } from './recordings-storage.service';
import { RecordingsService } from './recordings.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: diskStorage({
          destination: config.getOrThrow<string>('RECORDINGS_STORAGE_ROOT'),
          filename: (_req, file, callback) => {
            const extension = RECORDING_MIME_TO_EXTENSION[file.mimetype];
            callback(null, `${randomUUID()}${extension}`);
          },
        }),
        limits: {
          fileSize:
            Number(config.get<string>('RECORDINGS_MAX_BYTES')) || DEFAULT_MAX_RECORDING_BYTES,
          files: 1,
        },
        defParamCharset: 'utf8',
        fileFilter: recordingFileFilter,
      }),
    }),
  ],
  controllers: [RecordingsController],
  providers: [RecordingsService, RecordingsStorageService, MeetingOwnerGuard],
})
export class RecordingsModule {}
