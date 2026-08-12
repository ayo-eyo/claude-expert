import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MeetingOwnerGuard } from './guards/meeting-owner.guard';
import { MeetingRecordingResponse } from './meeting-recording-response.interface';
import { RecordingsService } from './recordings.service';

@UseGuards(JwtAuthGuard, MeetingOwnerGuard)
@Controller('meetings')
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Post(':id/recording')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id') meetingId: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MeetingRecordingResponse> {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.recordingsService.create(meetingId, file);
  }
}
