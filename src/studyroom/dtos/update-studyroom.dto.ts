import { IsOptional, IsString } from 'class-validator';

export class UpdateStudyroomDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
