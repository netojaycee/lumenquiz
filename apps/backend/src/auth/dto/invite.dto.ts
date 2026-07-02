import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator'

export class InviteDto {
  @IsEmail()
  email!: string

  @IsString()
  name!: string

  @IsIn(['ADMIN', 'OWNER', 'MEMBER'])
  role!: 'ADMIN' | 'OWNER' | 'MEMBER'

  @IsString()
  @IsOptional()
  areaName?: string
}
