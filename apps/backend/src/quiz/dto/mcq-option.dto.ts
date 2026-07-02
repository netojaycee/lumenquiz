import { IsBoolean, IsIn, IsString, MaxLength, MinLength } from 'class-validator'

export class MCQOptionDto {
  @IsIn(['A', 'B', 'C', 'D'])
  label!: string

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text!: string

  @IsBoolean()
  isCorrect!: boolean
}
