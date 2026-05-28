import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { AdminGuard } from './guards/admin.guard'
import { ModeratorGuard } from './guards/moderator.guard'

@Module({
  providers: [AuthService, AdminGuard, ModeratorGuard],
  controllers: [AuthController],
  exports: [AuthService, AdminGuard, ModeratorGuard],
})
export class AuthModule {}
