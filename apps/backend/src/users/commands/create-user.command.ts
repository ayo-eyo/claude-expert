import { Command } from '@nestjs/cqrs';
import { UserModel } from '../../generated/prisma/models';

export class CreateUserCommand extends Command<UserModel> {
  constructor(
    public readonly email: string,
    public readonly hashedPassword: string,
  ) {
    super();
  }
}
