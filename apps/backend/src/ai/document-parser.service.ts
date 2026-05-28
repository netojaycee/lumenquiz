import { BadRequestException, Injectable } from '@nestjs/common'

@Injectable()
export class DocumentParserService {
  async extractText(file: Express.Multer.File): Promise<string> {
    const mime = file.mimetype.toLowerCase()
    const name = file.originalname.toLowerCase()

    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      return this.parsePdf(file.buffer)
    }
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      return this.parseDocx(file.buffer)
    }
    throw new BadRequestException('Unsupported file type. Please upload a PDF or DOCX file.')
  }

  private async parsePdf(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const data = await pdfParse(buffer)
    return data.text.trim()
  }

  private async parseDocx(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>
    }
    const result = await mammoth.extractRawText({ buffer })
    return result.value.trim()
  }
}
