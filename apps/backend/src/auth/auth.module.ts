import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { AdminGuard } from './guards/admin.guard'
import { ModeratorGuard } from './guards/moderator.guard'
import { OwnerGuard } from './guards/owner.guard'
import { AuthSessionGuard } from './guards/auth-session.guard'
import { PrismaModule } from '../prisma/prisma.module'
import { EmailModule } from '@/common/email/email.module'

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [AuthService, AdminGuard, ModeratorGuard, OwnerGuard, AuthSessionGuard],
  controllers: [AuthController],
  exports: [AuthService, AdminGuard, ModeratorGuard, OwnerGuard, AuthSessionGuard],
})
export class AuthModule {}
