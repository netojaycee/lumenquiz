import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateQuizDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsDateString()
  date?: string
}
