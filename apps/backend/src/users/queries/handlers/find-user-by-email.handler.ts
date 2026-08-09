import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UserModel } from '../../../generated/prisma/models';
import { PrismaService } from '../../../prisma/prisma.service';
import { FindUserByEmailQuery } from '../find-user-by-email.query';

@Injectable()
@QueryHandler(FindUserByEmailQuery)
export class FindUserByEmailHandler implements IQueryHandler<
  FindUserByEmailQuery,
  UserModel | null
> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: FindUserByEmailQuery): Promise<UserModel | null> {
    return this.prisma.client.user.findUnique({ where: { email: query.email } });
  }
}
