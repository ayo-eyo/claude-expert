import { Module } from '@nestjs/common';
import { CreateUserHandler } from './commands/handlers/create-user.handler';
import { FindUserByEmailHandler } from './queries/handlers/find-user-by-email.handler';
import { FindUserByIdHandler } from './queries/handlers/find-user-by-id.handler';

const CommandHandlers = [CreateUserHandler];
const QueryHandlers = [FindUserByEmailHandler, FindUserByIdHandler];

@Module({
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class UsersModule {}
