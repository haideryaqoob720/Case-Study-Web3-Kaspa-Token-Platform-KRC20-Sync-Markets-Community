import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RecentKrc20TxQueryDto {
  @Transform(({ value }) => (value == null ? '' : String(value).trim()))
  @IsString()
  @MinLength(1, { message: 'tick is required' })
  tick: string;

  @Transform(({ value }) => (value == null ? '' : String(value).trim()))
  @IsString()
  @MinLength(1, { message: 'address is required' })
  @Matches(/^kaspa:/i, { message: 'address must be a kaspa: wallet' })
  address: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined || value === null
      ? undefined
      : String(value).trim(),
  )
  @IsString()
  next?: string;
}
