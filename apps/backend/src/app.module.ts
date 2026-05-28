import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { NetworkModule } from './network/network.module'
import { AuthModule } from './auth/auth.module'
import { QuizModule } from './quiz/quiz.module'
import { SessionModule } from './session/session.module'
import { GatewayModule } from './gateway/gateway.module'
import { SoundsModule } from './sounds/sounds.module'
import { DevModule } from './dev/dev.module'
import { UploadsModule } from './uploads/uploads.module'
import { AiModule } from './ai/ai.module'
import { SyncModule } from './sync/sync.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limit auth endpoints: max 15 requests per 60 seconds per IP.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 15 }]),
    PrismaModule,
    NetworkModule,
    AuthModule,
    QuizModule,
    SessionModule,
    GatewayModule,
    SoundsModule,
    DevModule,
    UploadsModule,
    AiModule,
    SyncModule,
  ],
})
export class AppModule {}
