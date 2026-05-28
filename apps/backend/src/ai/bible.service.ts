import { Injectable, Logger } from '@nestjs/common'
import { existsSync, readFileSync } from 'fs'
import * as path from 'path'

interface BibleBook {
  abbrev: string
  name: string   // thiagobodruk KJV JSON uses "name", not "book"
  chapters: string[][]
}

@Injectable()
export class BibleService {
  private readonly logger = new Logger(BibleService.name)
  private kjv: BibleBook[] | null = null
  private loadAttempted = false

  private loadLocal(): BibleBook[] | null {
    if (this.loadAttempted) return this.kjv
    this.loadAttempted = true

    // __dirname = dist/ai/ in compiled output → go up two levels to reach apps/backend/
    const candidates = [
      path.join(__dirname, '..', '..', 'data', 'bible', 'kjv.json'),
      path.join(process.cwd(), 'data', 'bible', 'kjv.json'),
    ]
    for (const p of candidates) {
      if (existsSync(p)) {
        try {
          // Strip UTF-8 BOM if present before parsing
          const raw = readFileSync(p, 'utf-8').replace(/^﻿/, '')
          this.kjv = JSON.parse(raw) as BibleBook[]
          this.logger.log(`KJV loaded from ${p} (${this.kjv.length} books)`)
          return this.kjv
        } catch {
          this.logger.warn(`Failed to parse KJV at ${p}`)
        }
      }
    }
    this.logger.warn('KJV JSON not found locally — using bible-api.com fallback')
    return null
  }

  async getText(params: {
    book: string
    chapterStart: number
    chapterEnd?: number
    verseStart?: number
    verseEnd?: number
  }): Promise<string> {
    const local = this.loadLocal()
    return local ? this.getLocalText(local, params) : this.getOnlineText(params)
  }

  private getLocalText(
    books: BibleBook[],
    { book, chapterStart, chapterEnd, verseStart, verseEnd }: {
      book: string
      chapterStart: number
      chapterEnd?: number
      verseStart?: number
      verseEnd?: number
    },
  ): string {
    const found = books.find(
      (b) =>
        b.name.toLowerCase() === book.toLowerCase() ||
        b.abbrev.toLowerCase() === book.toLowerCase(),
    )
    if (!found) throw new Error(`Book not found: ${book}`)

    const endChapter = chapterEnd ?? chapterStart
    const lines: string[] = []

    for (let c = chapterStart; c <= endChapter; c++) {
      const chapter = found.chapters[c - 1]
      if (!chapter) continue
      const isFirst = c === chapterStart
      const isLast = c === endChapter
      const vStart = isFirst && verseStart ? verseStart : 1
      const vEnd = isLast && verseEnd ? verseEnd : chapter.length

      for (let v = vStart; v <= vEnd; v++) {
        const verse = chapter[v - 1]
        if (verse) lines.push(`${found.name} ${c}:${v} — ${verse}`)
      }
    }

    if (lines.length === 0) throw new Error(`No verses found for ${book} ${chapterStart}`)
    return lines.join('\n')
  }

  private async getOnlineText(params: {
    book: string
    chapterStart: number
    chapterEnd?: number
    verseStart?: number
    verseEnd?: number
  }): Promise<string> {
    const { book, chapterStart, chapterEnd, verseStart, verseEnd } = params
    const b = encodeURIComponent(book.toLowerCase().replace(/ /g, '+'))

    let ref: string
    if (chapterEnd && chapterEnd !== chapterStart) {
      ref = `${b}+${chapterStart}-${chapterEnd}`
    } else if (verseStart && verseEnd) {
      ref = `${b}+${chapterStart}:${verseStart}-${verseEnd}`
    } else if (verseStart) {
      ref = `${b}+${chapterStart}:${verseStart}`
    } else {
      ref = `${b}+${chapterStart}`
    }

    const url = `https://bible-api.com/${ref}?translation=kjv`
    this.logger.log(`Fetching Bible passage online: ${url}`)
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`bible-api.com returned ${res.status}`)
    const data = (await res.json()) as { text: string }
    return data.text.trim()
  }
}
