import './session.types'
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { Request } from 'express'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { InviteDto } from './dto/invite.dto'
import { SetupPasswordDto } from './dto/setup-password.dto'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { AuthSessionGuard } from './guards/auth-session.guard'
import { OwnerGuard } from './guards/owner.guard'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const user = await this.auth.login(dto)
    
    // Save to express-session
    req.session.userId = user.id
    req.session.userEmail = user.email
    req.session.userRole = user.role
    req.session.userAreaName = user.areaName
    req.session.isAdmin = user.role === 'ADMIN' // Maintain backward compatibility if needed

    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    )

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      areaName: user.areaName,
    }
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request) {
    req.session.destroy(() => undefined)
    return { ok: true }
  }

  @Get('session')
  @UseGuards(AuthSessionGuard)
  async getSession(@Req() req: Request) {
    return {
      userId: req.session.userId,
      email: req.session.userEmail,
      role: req.session.userRole,
      areaName: req.session.userAreaName,
    }
  }

  @Post('invite')
  @HttpCode(200)
  @UseGuards(AuthSessionGuard, OwnerGuard)
  async invite(@Body() dto: InviteDto, @Req() req: Request) {
    const sender = {
      role: req.session.userRole!,
      areaName: req.session.userAreaName,
    }
    return this.auth.invite(dto, sender)
  }

  @Get('verify-invite')
  async verifyInvite(@Query('token') token: string) {
    return this.auth.verifyInvitation(token)
  }

  @Post('setup-password')
  @HttpCode(200)
  async setupPassword(@Body() dto: SetupPasswordDto) {
    return this.auth.setupPassword(dto)
  }

  @Post('forgot-password')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto)
  }

  @Get('verify-reset-token')
  async verifyResetToken(@Query('token') token: string) {
    return this.auth.verifyResetToken(token)
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto)
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AuthSessionGuard)
  async changePassword(@Body() dto: { password: string }, @Req() req: Request) {
    return this.auth.changePassword(req.session.userId!, dto.password)
  }
}
