import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { GameMode } from '@apoquiz/shared-types'

export class CreateRoundDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsEnum(GameMode)
  gameMode!: GameMode

  @IsInt()
  @Min(1)
  @Max(50)
  questionCount!: number

  @IsInt()
  @Min(5)
  @Max(300)
  timerSeconds!: number

  @IsInt()
  @Min(1)
  @Max(1000)
  pointsPerQuestion!: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  bonusPointsPerQuestion?: number
}
