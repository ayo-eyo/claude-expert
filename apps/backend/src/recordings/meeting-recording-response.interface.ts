import { MeetingRecordingModel } from '../generated/prisma/models';
import { RecordingStatus } from '../generated/prisma/enums';

export interface MeetingRecordingResponse {
  id: string;
  meetingId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: RecordingStatus;
  uploadedAt: string;
}

export function toMeetingRecordingResponse(
  recording: MeetingRecordingModel,
): MeetingRecordingResponse {
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
