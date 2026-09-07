import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MeetingRecordingModel } from '../generated/prisma/models';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MeetingRecordingResponse,
  toMeetingRecordingResponse,
} from './meeting-recording-response.interface';
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
      return toMeetingRecordingResponse(recording);
    } catch (error) {
      await this.storage.remove(file.filename);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Recording already exists for this meeting');
      }
      throw error;
    }
  }

  async findForMeeting(meetingId: string): Promise<MeetingRecordingResponse> {
    return toMeetingRecordingResponse(await this.getOrThrow(meetingId));
  }

  async getStorageInfo(
    meetingId: string,
  ): Promise<Pick<MeetingRecordingModel, 'storagePath' | 'mimeType' | 'originalName'>> {
    const recording = await this.getOrThrow(meetingId);
    return {
      storagePath: recording.storagePath,
      mimeType: recording.mimeType,
      originalName: recording.originalName,
    };
  }

  async remove(meetingId: string): Promise<void> {
    const recording = await this.getOrThrow(meetingId);
    // Delete the DB row first, then the file: a failure after this point leaves an
    // orphaned file on disk (harmless, sweepable) rather than a DB row pointing at
    // a file that no longer exists.
    try {
      await this.prisma.client.meetingRecording.delete({ where: { id: recording.id } });
    } catch (error) {
      // A concurrent delete (or a Meeting cascade) already removed the row — that
      // request owns cleanup of the same file, so treat this as done.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return;
      }
      throw error;
    }
    await this.storage.remove(recording.storagePath);
  }

  private async getOrThrow(meetingId: string): Promise<MeetingRecordingModel> {
    const recording = await this.prisma.client.meetingRecording.findUnique({
      where: { meetingId },
    });
    if (!recording) {
      throw new NotFoundException('Recording not found');
    }
    return recording;
  }
}
