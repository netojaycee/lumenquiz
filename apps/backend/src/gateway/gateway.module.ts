import { Module } from '@nestjs/common'
import { QuizGateway } from './quiz.gateway'
import { AuthModule } from '../auth/auth.module'
import { NetworkModule } from '../network/network.module'

@Module({
  imports: [AuthModule, NetworkModule],
  providers: [QuizGateway],
})
export class GatewayModule {}
