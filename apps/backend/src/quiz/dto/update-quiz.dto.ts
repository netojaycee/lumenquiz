import { PartialType } from '@nestjs/mapped-types'
import { CreateQuizDto } from './create-quiz.dto'
import { IsEnum, IsOptional } from 'class-validator'
import { QuizStatus } from '@apoquiz/shared-types'

export class UpdateQuizDto extends PartialType(CreateQuizDto) {
  @IsOptional()
  @IsEnum(QuizStatus)
  status?: QuizStatus
}
