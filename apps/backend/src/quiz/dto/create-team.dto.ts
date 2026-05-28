import {
  ArrayMaxSize,
  IsArray,
  IsHexColor,
  IsOptional,
  IsString,

  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class TeamMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string

  @IsOptional()
  @IsString()
  avatarUrl?: string
}

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string

  @IsHexColor()
  color!: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TeamMemberDto)
  members?: TeamMemberDto[]
}
