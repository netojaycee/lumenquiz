import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AdminGuard } from '../auth/guards/admin.guard'
import { AiService } from './ai.service'
import { BibleService } from './bible.service'
import { DocumentParserService } from './document-parser.service'

interface MulterFile {
  fieldname: string
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}

@UseGuards(AdminGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly bibleService: BibleService,
    private readonly docParser: DocumentParserService,
  ) {}

  @Get('status')
  getStatus() {
    return this.aiService.getProviderStatus()
  }

  @Post('generate/document')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async generateFromDocument(
    @UploadedFile() file: MulterFile | undefined,
    @Body('gameMode') gameMode: string,
    @Body('roundName') roundName: string,
    @Body('count') countRaw: string,
    @Body('difficulty') difficulty: string,
    @Body('instructions') instructions?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded')
    if (!gameMode || !roundName) throw new BadRequestException('gameMode and roundName are required')

    const count = parseInt(countRaw ?? '10', 10)
    if (isNaN(count) || count < 1) throw new BadRequestException('count must be a positive number')

    const text = await this.docParser.extractText(file as Express.Multer.File)
    if (!text.trim()) throw new BadRequestException('Could not extract any text from the file')

    const questions = await this.aiService.generateQuestions({
      text,
      gameMode,
      roundName,
      count,
      difficulty: (difficulty as 'easy' | 'medium' | 'hard' | 'mixed') || 'mixed',
      instructions: instructions?.trim() || undefined,
    })
    return { questions }
  }

  @Post('generate/bible')
  async generateFromBible(
    @Body('book') book: string,
    @Body('chapterStart') chapterStartRaw: string,
    @Body('chapterEnd') chapterEndRaw: string | undefined,
    @Body('verseStart') verseStartRaw: string | undefined,
    @Body('verseEnd') verseEndRaw: string | undefined,
    @Body('gameMode') gameMode: string,
    @Body('roundName') roundName: string,
    @Body('count') countRaw: string,
    @Body('difficulty') difficulty: string,
    @Body('instructions') instructions?: string,
  ) {
    if (!book || !chapterStartRaw || !gameMode || !roundName) {
      throw new BadRequestException('book, chapterStart, gameMode, and roundName are required')
    }

    const chapterStart = parseInt(chapterStartRaw, 10)
    if (isNaN(chapterStart)) throw new BadRequestException('chapterStart must be a number')

    const chapterEnd = chapterEndRaw ? parseInt(chapterEndRaw, 10) : undefined
    const verseStart = verseStartRaw ? parseInt(verseStartRaw, 10) : undefined
    const verseEnd = verseEndRaw ? parseInt(verseEndRaw, 10) : undefined
    const count = parseInt(countRaw ?? '10', 10)

    const text = await this.bibleService.getText({ book, chapterStart, chapterEnd, verseStart, verseEnd })
    if (!text.trim()) throw new BadRequestException('Could not retrieve Bible passage')

    const questions = await this.aiService.generateQuestions({
      text,
      gameMode,
      roundName,
      count,
      difficulty: (difficulty as 'easy' | 'medium' | 'hard' | 'mixed') || 'mixed',
      instructions: instructions?.trim() || undefined,
    })
    return { questions }
  }
}
