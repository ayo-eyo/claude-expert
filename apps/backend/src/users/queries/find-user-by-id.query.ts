import { Query } from '@nestjs/cqrs';
import { UserModel } from '../../generated/prisma/models';

export class FindUserByIdQuery extends Query<UserModel | null> {
  constructor(public readonly id: string) {
    super();
  }
}
