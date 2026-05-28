import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import * as path from 'path'
import * as fs from 'fs'

// Each entry rewrites a dynamic segment to the `_` placeholder used by the
// Next.js static export. The regex matches the prefix of the path (no `$`
// anchor), so the remainder (sub-routes, file names, query strings) is
// preserved automatically by String.replace().
//
// This handles BOTH html pages and RSC payload files (*.txt) that Next.js
// fetches during client-side navigation.
const DYNAMIC_REWRITES: Array<[RegExp, string]> = [
  [/^\/team\/[^/]+/, '/team/_'],
  [/^\/audience\/[^/]+/, '/audience/_'],
  [/^\/screen\/[^/]+/, '/screen/_'],
  [/^\/moderator\/[^/]+/, '/moderator/_'],
  [/^\/host\/live\/[^/]+/, '/host/live/_'],
  [/^\/host\/quiz\/[^/]+/, '/host/quiz/_'],
  [/^\/host\/results\/[^/]+/, '/host/results/_'],
]

@Injectable()
export class StaticMiddleware implements NestMiddleware {
  private readonly publicPath = path.join(process.cwd(), 'public')

  use(req: Request, res: Response, next: NextFunction): void {
    // API and Socket.IO are handled by NestJS — never touch these
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next()
      return
    }

    // Decode percent-encoded characters (e.g. %5BquizId%5D → [quizId]) so that
    // path.join produces a real filesystem path. Express does NOT auto-decode req.path.
    let urlPath: string
    try {
      urlPath = decodeURIComponent(req.path)
    } catch {
      urlPath = req.path
    }

    // 1. Exact file match (JS chunks, CSS, images, .txt RSC payloads, etc.)
    if (this.serveIfFile(res, path.join(this.publicPath, urlPath))) return

    // 2. Directory index.html (for non-dynamic paths like /host, /join, etc.)
    if (this.serveIfFile(res, path.join(this.publicPath, urlPath, 'index.html'))) return

    // 3. Rewrite dynamic segment to `_` placeholder and retry
    for (const [pattern, replacement] of DYNAMIC_REWRITES) {
      if (pattern.test(urlPath)) {
        const rewritten = urlPath.replace(pattern, replacement)

        // Exact file (handles /quiz/actualId/index.txt → /quiz/_/index.txt etc.)
        if (this.serveIfFile(res, path.join(this.publicPath, rewritten))) return

        // Directory index.html (handles /quiz/actualId → /quiz/_/index.html etc.)
        if (this.serveIfFile(res, path.join(this.publicPath, rewritten, 'index.html'))) return

        break // Only the first matching rule applies
      }
    }

    next()
  }

  private serveIfFile(res: Response, filePath: string): boolean {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(filePath)
        return true
      }
    } catch {
      // ignore fs errors — fall through to next()
    }
    return false
  }
}
