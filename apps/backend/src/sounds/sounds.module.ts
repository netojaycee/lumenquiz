import { Module } from '@nestjs/common'
import { SoundsController } from './sounds.controller'
import { SoundsService } from './sounds.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  controllers: [SoundsController],
  providers: [SoundsService],
})
export class SoundsModule {}
