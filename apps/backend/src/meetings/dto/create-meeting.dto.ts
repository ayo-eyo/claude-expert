import { ArrayUnique, IsArray, IsISO8601, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsISO8601()
  date: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  participants: string[];
}
