import './session.types'
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { Request } from 'express'
import { AuthService } from './auth.service'
import { AdminGuard } from './guards/admin.guard'
import { AdminLoginDto } from './dto/admin-login.dto'
import { ModeratorVerifyDto } from './dto/moderator-verify.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('admin/login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async adminLogin(@Body() dto: AdminLoginDto, @Req() req: Request): Promise<{ ok: boolean }> {
    if (!this.auth.validateAdminPassword(dto.password)) {
      throw new UnauthorizedException('Invalid password')
    }
    req.session.isAdmin = true
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    )
    return { ok: true }
  }

  @Post('admin/logout')
  @HttpCode(200)
  adminLogout(@Req() req: Request) {
    req.session.destroy(() => undefined)
    return { ok: true }
  }

  @Post('admin/change-password')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  changeAdminPassword(@Body() dto: { currentPassword: string; newPassword: string }) {
    this.auth.changeAdminPassword(dto.currentPassword, dto.newPassword)
    return { ok: true }
  }

  @Post('moderator/change-pin')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  changeModeratorPin(@Body() dto: { newPin: string }) {
    this.auth.changeModeratorPin(dto.newPin)
    return { ok: true }
  }

  @Post('moderator/verify')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  moderatorVerify(@Body() dto: ModeratorVerifyDto) {
    if (!this.auth.validateModeratorPin(dto.pin)) {
      throw new UnauthorizedException('Invalid moderator PIN')
    }
    return { ok: true, sessionId: dto.sessionId }
  }
}
