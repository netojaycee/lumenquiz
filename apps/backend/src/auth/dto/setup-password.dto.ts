import { IsString, MinLength } from 'class-validator'

export class SetupPasswordDto {
  @IsString()
  token!: string

  @IsString()
  @MinLength(6)
  password!: string
}
