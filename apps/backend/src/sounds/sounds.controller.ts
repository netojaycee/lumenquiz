import {
  Controller, Get, Post, Delete, Param, Res,
  UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, NotFoundException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { memoryStorage } from 'multer'
import { SoundsService, SoundKey } from './sounds.service'
import { AdminGuard } from '../auth/guards/admin.guard'

@Controller('sounds')
export class SoundsController {
  constructor(private readonly soundsService: SoundsService) {}

  @Get('config')
  getConfig(): Record<SoundKey, string> {
    return this.soundsService.getConfig()
  }

  @Post('upload/:key')
  @UseGuards(AdminGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        const allowed = /\.(mp3|wav|ogg|m4a|aac)$/i
        if (!allowed.test(file.originalname)) {
          cb(new BadRequestException('Only audio files are allowed (mp3, wav, ogg, m4a, aac)'), false)
        } else {
          cb(null, true)
        }
      },
    }),
  )
  uploadSound(
    @Param('key') key: string,
    @UploadedFile() file: Express.Multer.File,
  ): { ok: boolean } {
    if (!this.soundsService.isValidKey(key)) {
      throw new BadRequestException(`Unknown sound key: ${key}`)
    }
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }
    this.soundsService.saveSound(key as SoundKey, file.buffer, file.originalname)
    return { ok: true }
  }

  @Delete(':key')
  @UseGuards(AdminGuard)
  resetSound(@Param('key') key: string): { ok: boolean } {
    if (!this.soundsService.isValidKey(key)) {
      throw new BadRequestException(`Unknown sound key: ${key}`)
    }
    this.soundsService.resetSound(key as SoundKey)
    return { ok: true }
  }

  @Get('file/:key')
  serveCustomFile(@Param('key') key: string, @Res() res: Response): void {
    if (!this.soundsService.isValidKey(key)) {
      throw new BadRequestException(`Unknown sound key: ${key}`)
    }
    const filePath = this.soundsService.getCustomFilePath(key as SoundKey)
    if (!filePath) {
      throw new NotFoundException(`No custom file for key: ${key}`)
    }
    res.sendFile(filePath)
  }
}
