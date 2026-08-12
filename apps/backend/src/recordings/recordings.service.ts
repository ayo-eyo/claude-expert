import { ConflictException, Injectable } from '@nestjs/common';
import { MeetingRecordingModel } from '../generated/prisma/models';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingRecordingResponse } from './meeting-recording-response.interface';
import { RecordingsStorageService } from './recordings-storage.service';

@Injectable()
export class RecordingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: RecordingsStorageService,
  ) {}

  async create(meetingId: string, file: Express.Multer.File): Promise<MeetingRecordingResponse> {
    try {
      const recording = await this.prisma.client.meetingRecording.create({
        data: {
          meetingId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath: file.filename,
          status: 'uploaded',
        },
      });
      return this.toResponse(recording);
    } catch (error) {
      await this.storage.remove(file.filename);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Recording already exists for this meeting');
      }
      throw error;
    }
  }

  private toResponse(recording: MeetingRecordingModel): MeetingRecordingResponse {
    return {
      id: recording.id,
      meetingId: recording.meetingId,
      originalName: recording.originalName,
      mimeType: recording.mimeType,
      sizeBytes: recording.sizeBytes,
      status: recording.status,
      uploadedAt: recording.uploadedAt.toISOString(),
    };
  }
}
