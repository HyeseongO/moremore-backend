import { IsNotEmpty, IsNumber } from 'class-validator';

export class TransferOwnershipDto {
  @IsNotEmpty()
  @IsNumber()
  newOwnerId: number;
}
