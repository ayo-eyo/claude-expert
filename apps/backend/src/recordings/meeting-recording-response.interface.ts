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
