import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Request } from 'express'

interface MulterFile {
  fieldname: string
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}
import { AuthSessionGuard } from '../auth/guards/auth-session.guard'
import { QuizService } from './quiz.service'
import { QuizImportService } from './quiz-import.service'
import { CreateQuizDto } from './dto/create-quiz.dto'
import { UpdateQuizDto } from './dto/update-quiz.dto'
import { CreateTeamDto } from './dto/create-team.dto'
import { UpdateTeamDto } from './dto/update-team.dto'
import { CreateRoundDto } from './dto/create-round.dto'
import { UpdateRoundDto } from './dto/update-round.dto'
import { CreateQuestionDto } from './dto/create-question.dto'
import { UpdateQuestionDto } from './dto/update-question.dto'
import { ReorderDto } from './dto/reorder.dto'

const ALLOWED_IMPORT_MIMETYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
])

@UseGuards(AuthSessionGuard)
@Controller('quiz')
export class QuizController {
  constructor(
    private readonly quizService: QuizService,
    private readonly importService: QuizImportService,
  ) {}

  // ─── Quiz ─────────────────────────────────────────────────────────────────

  @Post()
  createQuiz(@Body() dto: CreateQuizDto, @Req() req: Request) {
    // If user is OWNER, enforce their areaName
    const areaName = req.session.userRole === 'ADMIN' ? dto.areaName : req.session.userAreaName;
    return this.quizService.createQuiz({ ...dto, areaName });
  }

  @Get()
  listQuizzes(@Req() req: Request, @Query('area') area?: string) {
    const userRole = req.session.userRole!;
    const areaName = req.session.userAreaName || null;
    return this.quizService.listQuizzes(userRole, areaName, area);
  }

  @Get(':id')
  getQuiz(@Param('id') id: string, @Req() req: Request) {
    const userRole = req.session.userRole!;
    const areaName = req.session.userAreaName;
    return this.quizService.getQuiz(id, userRole, areaName)
  }

  @Patch(':id')
  updateQuiz(@Param('id') id: string, @Body() dto: UpdateQuizDto, @Req() req: Request) {
    const userRole = req.session.userRole!;
    const areaName = req.session.userAreaName;
    return this.quizService.updateQuiz(id, dto, userRole, areaName)
  }

  @Delete(':id')
  @HttpCode(200)
  deleteQuiz(@Param('id') id: string, @Req() req: Request) {
    const userRole = req.session.userRole!;
    const areaName = req.session.userAreaName;
    return this.quizService.deleteQuiz(id, userRole, areaName)
  }

  // ─── Teams ────────────────────────────────────────────────────────────────

  @Post(':id/teams')
  createTeam(@Param('id') quizId: string, @Body() dto: CreateTeamDto) {
    return this.quizService.createTeam(quizId, dto)
  }

  @Patch(':id/teams/:teamId')
  updateTeam(
    @Param('id') quizId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.quizService.updateTeam(quizId, teamId, dto)
  }

  @Delete(':id/teams/:teamId')
  @HttpCode(200)
  deleteTeam(@Param('id') quizId: string, @Param('teamId') teamId: string) {
    return this.quizService.deleteTeam(quizId, teamId)
  }

  @Post(':id/teams/:teamId/regenerate-pin')
  regeneratePin(@Param('id') quizId: string, @Param('teamId') teamId: string) {
    return this.quizService.regenerateTeamPin(quizId, teamId)
  }

  @Post(':id/teams/:teamId/regenerate-join-code')
  regenerateJoinCode(@Param('id') quizId: string, @Param('teamId') teamId: string) {
    return this.quizService.regenerateJoinCode(quizId, teamId)
  }

  // ─── Rounds ───────────────────────────────────────────────────────────────

  @Post(':id/rounds')
  createRound(@Param('id') quizId: string, @Body() dto: CreateRoundDto) {
    return this.quizService.createRound(quizId, dto)
  }

  @Patch(':id/rounds/:roundId')
  updateRound(
    @Param('id') quizId: string,
    @Param('roundId') roundId: string,
    @Body() dto: UpdateRoundDto,
  ) {
    return this.quizService.updateRound(quizId, roundId, dto)
  }

  @Delete(':id/rounds/:roundId')
  @HttpCode(200)
  deleteRound(@Param('id') quizId: string, @Param('roundId') roundId: string) {
    return this.quizService.deleteRound(quizId, roundId)
  }

  @Put(':id/rounds/reorder')
  reorderRounds(@Param('id') quizId: string, @Body() dto: ReorderDto) {
    return this.quizService.reorderRounds(quizId, dto.ids)
  }

  // ─── Questions ────────────────────────────────────────────────────────────

  @Post(':id/rounds/:roundId/questions')
  createQuestion(
    @Param('id') quizId: string,
    @Param('roundId') roundId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.quizService.createQuestion(quizId, roundId, dto)
  }

  @Patch(':id/rounds/:roundId/questions/:qId')
  updateQuestion(
    @Param('id') quizId: string,
    @Param('roundId') roundId: string,
    @Param('qId') qId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.quizService.updateQuestion(quizId, roundId, qId, dto)
  }

  @Delete(':id/rounds/:roundId/questions/:qId')
  @HttpCode(200)
  deleteQuestion(
    @Param('id') quizId: string,
    @Param('roundId') roundId: string,
    @Param('qId') qId: string,
  ) {
    return this.quizService.deleteQuestion(quizId, roundId, qId)
  }

  @Put(':id/rounds/:roundId/questions/reorder')
  reorderQuestions(
    @Param('id') quizId: string,
    @Param('roundId') roundId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.quizService.reorderQuestions(quizId, roundId, dto.ids)
  }

  /**
   * POST /api/quiz/:id/rounds/:roundId/questions/import
   *
   * Accepts a .csv or .xlsx file upload (field name: "file").
   * Query param ?preview=true returns parsed rows without saving (for frontend preview table).
   * Default (no preview param): parses and saves all valid rows, returns { saved, skipped, errors }.
   */
  @Post(':id/rounds/:roundId/questions/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importQuestions(
    @Param('id') quizId: string,
    @Param('roundId') roundId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Query('preview') preview?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded — send file in "file" field')
    if (!ALLOWED_IMPORT_MIMETYPES.has(file.mimetype) && !file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      throw new BadRequestException('Only .csv and .xlsx files are supported')
    }

    const parsed = this.importService.parseFile(file.buffer)

    if (preview === 'true') {
      return { rows: parsed, total: parsed.length, valid: parsed.filter((r) => r.errors.length === 0).length }
    }

    const round = await this.quizService.getRoundForImport(quizId, roundId)
    const result = await this.importService.saveQuestions(roundId, parsed, round.pointsPerQuestion)

    const allErrors = parsed.flatMap((r) => r.errors)
    return { ...result, errors: allErrors }
  }
}
