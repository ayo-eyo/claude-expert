import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { CreateUserCommand } from '../users/commands/create-user.command';
import { FindUserByEmailQuery } from '../users/queries/find-user-by-email.query';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload.interface';

const SALT_ROUNDS = 10;

export interface AuthResult {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existingUser = await this.queryBus.execute(new FindUserByEmailQuery(dto.email));
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.commandBus.execute(new CreateUserCommand(dto.email, hashedPassword));

    return { accessToken: this.signToken(user.id, user.email) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.queryBus.execute(new FindUserByEmailQuery(dto.email));
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { accessToken: this.signToken(user.id, user.email) };
  }

  private signToken(userId: string, email: string): string {
    const payload: JwtPayload = { sub: userId, email };
    return this.jwtService.sign(payload);
  }
}
