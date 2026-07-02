import { IsString, Length } from 'class-validator'

export class ModeratorVerifyDto {
  @IsString()
  @Length(4, 4)
  pin!: string

  @IsString()
  sessionId!: string
}
