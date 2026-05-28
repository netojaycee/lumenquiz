import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { BibleService } from './bible.service'
import { DocumentParserService } from './document-parser.service'
import { OllamaProvider } from './providers/ollama.provider'
import { GrokProvider } from './providers/grok.provider'
import { GeminiProvider } from './providers/gemini.provider'

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    BibleService,
    DocumentParserService,
    OllamaProvider,
    GrokProvider,
    GeminiProvider,
  ],
})
export class AiModule {}
