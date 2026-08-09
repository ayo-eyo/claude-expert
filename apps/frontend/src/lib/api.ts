export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AuthResult {
  accessToken: string;
}

interface NestErrorBody {
  message?: string | string[];
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as NestErrorBody | null;
  const message = Array.isArray(body?.message)
    ? body.message.join(' ')
    : (body?.message ?? 'Something went wrong. Please try again.');
  return new ApiError(message, response.status);
}

export async function registerUser(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<AuthResult>;
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<AuthResult>;
}

export interface MeetingResponse {
  id: string;
  title: string;
  date: string;
  ownerId: string;
  participants: string[];
  createdAt: string;
}

export async function getMeetings(token: string): Promise<MeetingResponse[]> {
  const response = await fetch(`${API_BASE_URL}/meetings`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<MeetingResponse[]>;
}

export async function createMeeting(
  token: string,
  input: { title: string; date: string; participants: string[] },
): Promise<MeetingResponse> {
  const response = await fetch(`${API_BASE_URL}/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<MeetingResponse>;
}
