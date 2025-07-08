import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RoomType } from '@prisma/client';

export class CreateStudyroomDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsEnum(RoomType)
  roomType: RoomType;
}
