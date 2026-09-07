import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MeetingOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const meetingId = request.params.id as string;

    const meeting = await this.prisma.client.meeting.findFirst({
      where: { id: meetingId, ownerId: request.user.id },
      select: { id: true },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return true;
  }
}
