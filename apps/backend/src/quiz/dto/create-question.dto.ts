import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { QuestionDifficulty, QuestionType } from '@apoquiz/shared-types'
import { MCQOptionDto } from './mcq-option.dto'

export class CreateQuestionDto {
  @IsEnum(QuestionType)
  type!: QuestionType

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  correctAnswer!: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  aliases?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  clues?: string[]

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  fuzzyThreshold?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  points?: number

  @IsOptional()
  @IsEnum(QuestionDifficulty)
  difficulty?: QuestionDifficulty

  @IsOptional()
  @IsString()
  mediaUrl?: string

  @ValidateIf((o: CreateQuestionDto) => o.type === QuestionType.MCQ)
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => MCQOptionDto)
  options?: MCQOptionDto[]
}
