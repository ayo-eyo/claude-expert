import { Query } from '@nestjs/cqrs';
import { UserModel } from '../../generated/prisma/models';

export class FindUserByEmailQuery extends Query<UserModel | null> {
  constructor(public readonly email: string) {
    super();
  }
}
