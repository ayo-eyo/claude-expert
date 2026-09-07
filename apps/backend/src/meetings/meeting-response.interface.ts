import { MeetingRecordingResponse } from '../recordings/meeting-recording-response.interface';

export interface MeetingResponse {
  id: string;
  title: string;
  date: string;
  ownerId: string;
  participants: string[];
  createdAt: string;
  recording: MeetingRecordingResponse | null;
}
