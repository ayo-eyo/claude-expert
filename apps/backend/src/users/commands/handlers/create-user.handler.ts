import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserModel } from '../../../generated/prisma/models';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUserCommand } from '../create-user.command';

@Injectable()
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, UserModel> {
  constructor(private readonly prisma: PrismaService) {}

  execute(command: CreateUserCommand): Promise<UserModel> {
    return this.prisma.client.user.create({
      data: { email: command.email, password: command.hashedPassword },
    });
  }
}
