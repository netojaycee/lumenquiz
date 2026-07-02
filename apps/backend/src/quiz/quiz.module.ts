import { Module } from '@nestjs/common'
import { QuizController } from './quiz.controller'
import { QuizService } from './quiz.service'
import { QuizImportService } from './quiz-import.service'
import { AuthModule } from '../auth/auth.module'
import { SessionModule } from '../session/session.module'

@Module({
  imports: [AuthModule, SessionModule],
  controllers: [QuizController],
  providers: [QuizService, QuizImportService],
  exports: [QuizService],
})
export class QuizModule {}
