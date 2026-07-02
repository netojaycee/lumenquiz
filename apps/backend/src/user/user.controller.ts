import { Controller, Get, Post, Param, UseGuards, Req, HttpCode, Body } from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';
import { UserService } from './user.service';
import { Request } from 'express';

@Controller('users')
@UseGuards(AuthSessionGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async listUsers(@Req() req: Request) {
    return this.userService.listUsers(req.session.userRole!, req.session.userAreaName || null);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @UseGuards(OwnerGuard)
  async suspendUser(@Param('id') id: string, @Req() req: Request) {
    const sender = {
      id: req.session.userId!,
      role: req.session.userRole!,
      areaName: req.session.userAreaName,
    };
    return this.userService.suspendUser(id, sender);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @UseGuards(OwnerGuard)
  async reactivateUser(@Param('id') id: string, @Req() req: Request) {
    const sender = {
      role: req.session.userRole!,
      areaName: req.session.userAreaName,
    };
    return this.userService.reactivateUser(id, sender);
  }

  @Post(':id/role')
  @HttpCode(200)
  @UseGuards(OwnerGuard)
  async updateRole(
    @Param('id') id: string,
    @Body() dto: { role: 'OWNER' | 'MEMBER' },
    @Req() req: Request,
  ) {
    const sender = {
      role: req.session.userRole!,
      areaName: req.session.userAreaName,
    };
    return this.userService.updateRole(id, dto.role, sender);
  }
}
