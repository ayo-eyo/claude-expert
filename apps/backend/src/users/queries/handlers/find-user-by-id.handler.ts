import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UserModel } from '../../../generated/prisma/models';
import { PrismaService } from '../../../prisma/prisma.service';
import { FindUserByIdQuery } from '../find-user-by-id.query';

@Injectable()
@QueryHandler(FindUserByIdQuery)
export class FindUserByIdHandler implements IQueryHandler<FindUserByIdQuery, UserModel | null> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: FindUserByIdQuery): Promise<UserModel | null> {
    return this.prisma.client.user.findUnique({ where: { id: query.id } });
  }
}
