import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MeetingModel, UserModel } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingResponse } from './meeting-response.interface';

const MEETING_INCLUDE = { participants: true } as const;

type MeetingWithParticipants = MeetingModel & { participants: UserModel[] };

@Injectable()
export class MeetingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateMeetingDto): Promise<MeetingResponse> {
    if (dto.participants.length > 0) {
      const existingCount = await this.prisma.client.user.count({
        where: { id: { in: dto.participants } },
      });
      if (existingCount !== dto.participants.length) {
        throw new BadRequestException('One or more participants do not exist');
      }
    }

    const meeting = await this.prisma.client.meeting.create({
      data: {
        title: dto.title,
        date: new Date(dto.date),
        ownerId,
        participants: { connect: dto.participants.map((id) => ({ id })) },
      },
      include: MEETING_INCLUDE,
    });

    return this.toResponse(meeting);
  }

  async findAllForOwner(ownerId: string): Promise<MeetingResponse[]> {
    const meetings = await this.prisma.client.meeting.findMany({
      where: { ownerId },
      include: MEETING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return meetings.map((meeting) => this.toResponse(meeting));
  }

  async findOneForOwner(ownerId: string, id: string): Promise<MeetingResponse> {
    const meeting = await this.prisma.client.meeting.findFirst({
      where: { id, ownerId },
      include: MEETING_INCLUDE,
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return this.toResponse(meeting);
  }

  private toResponse(meeting: MeetingWithParticipants): MeetingResponse {
    return {
      id: meeting.id,
      title: meeting.title,
      date: meeting.date.toISOString(),
      ownerId: meeting.ownerId,
      participants: meeting.participants.map((participant) => participant.id),
      createdAt: meeting.createdAt.toISOString(),
    };
  }
}
