import { Module } from '@nestjs/common'
import { SessionController, SessionPublicController } from './session.controller'
import { SessionService } from './session.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [SessionPublicController, SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
