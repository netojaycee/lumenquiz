import { Module } from '@nestjs/common'
import { QuizGateway } from './quiz.gateway'
import { AuthModule } from '../auth/auth.module'
import { NetworkModule } from '../network/network.module'
import { NewRelicWsInterceptor } from '../common/observability/newrelic-ws.interceptor'

@Module({
  imports: [AuthModule, NetworkModule],
  providers: [QuizGateway, NewRelicWsInterceptor],
})
export class GatewayModule {}
