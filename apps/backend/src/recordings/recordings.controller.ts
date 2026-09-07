import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { attachmentContentDisposition } from './content-disposition';
import { MeetingOwnerGuard } from './guards/meeting-owner.guard';
import { MeetingRecordingResponse } from './meeting-recording-response.interface';
import { RecordingsService } from './recordings.service';
import { RecordingsStorageService } from './recordings-storage.service';

@UseGuards(JwtAuthGuard, MeetingOwnerGuard)
@Controller('meetings')
export class RecordingsController {
  constructor(
    private readonly recordingsService: RecordingsService,
    private readonly storage: RecordingsStorageService,
  ) {}

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

  @Get(':id/recording')
  findOne(@Param('id') meetingId: string): Promise<MeetingRecordingResponse> {
    return this.recordingsService.findForMeeting(meetingId);
  }

  @Get(':id/recording/download')
  async download(@Param('id') meetingId: string): Promise<StreamableFile> {
    const { storagePath, mimeType, originalName } =
      await this.recordingsService.getStorageInfo(meetingId);
    if (!(await this.storage.exists(storagePath))) {
      throw new NotFoundException('Recording file is missing');
    }
    return new StreamableFile(this.storage.createReadStream(storagePath), {
      type: mimeType,
      disposition: attachmentContentDisposition(originalName),
    });
  }

  @Delete(':id/recording')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') meetingId: string): Promise<void> {
    return this.recordingsService.remove(meetingId);
  }
}
