import 'reflect-metadata'
import * as path from 'path'
import * as fs from 'fs'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import session from 'express-session'
import FileStoreFactory from 'session-file-store'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'
import { StaticMiddleware } from './static/static.middleware'
import { GAME_CONSTANTS } from '@apoquiz/shared-types'

const FileStore = FileStoreFactory(session)

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')

  const sessionsDir = path.join(process.cwd(), 'data', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })

  const isProduction = process.env['NODE_ENV'] === 'production'
  const publicUrl = process.env['PUBLIC_URL'] ?? ''
  // Cookies need Secure flag only when the server is actually behind HTTPS.
  // This is true in production (nginx/reverse-proxy), NOT when running locally
  // even if PUBLIC_URL points to an https:// domain.
  const secureCookies = isProduction

  // When running in production (behind nginx/HTTPS), trust the proxy's
  // X-Forwarded-* headers so express-session sets the Secure cookie correctly.
  if (isProduction) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1)
  }

  // The proxy fronting this subdomain terminates TLS but does not forward
  // X-Forwarded-Proto, so Express sees the request as plain HTTP and
  // express-session refuses to issue the Secure cookie. PUBLIC_URL tells us the
  // real public scheme, so normalise the header for /api requests.
  if (isProduction && publicUrl.startsWith('https')) {
    app.use('/api', (req: any, _res: any, next: any) => {
      if (!req.headers['x-forwarded-proto']) req.headers['x-forwarded-proto'] = 'https'
      next()
    })
  }

  app.use("/api",
    session({
      store: new FileStore({
        path: sessionsDir,
        ttl: 86400, // 24 hours in seconds
        retries: 1,
        logFn: () => undefined, // suppress noisy file-store logs
      }),
      secret: process.env['SESSION_SECRET'] ?? 'apoquiz-dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: secureCookies,
        sameSite: secureCookies ? 'none' : 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  )

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  app.useGlobalFilters(new GlobalExceptionFilter())

  // Accept localhost, any RFC 1918 LAN address, and the configured PUBLIC_URL domain.
  const privateIpPattern =
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|169\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/

  // Derive allowed public origin from PUBLIC_URL (e.g. https://quiz.yourdomain.com)
  const allowedPublicOrigin = publicUrl
    ? new URL(publicUrl.startsWith('http') ? publicUrl : `https://${publicUrl}`).origin
    : null

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true) // same-origin / curl / Electron
      if (privateIpPattern.test(origin)) return callback(null, true)
      if (allowedPublicOrigin && origin === allowedPublicOrigin) return callback(null, true)
      callback(new Error(`CORS: origin not allowed — ${origin}`))
    },
    credentials: true,
  })

  // Serve uploaded member avatars statically at /uploads/...
  const uploadsPath = path.join(process.cwd(), 'uploads')
  fs.mkdirSync(uploadsPath, { recursive: true })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const serveStatic = (require('express') as typeof import('express')).static
  app.use('/uploads', serveStatic(uploadsPath))

  // Register static file serving as a plain Express middleware so it runs
  // for ALL incoming requests regardless of NestJS route matching behaviour,
  // which changed in NestJS 10.4 (path-to-regexp v8 broke forRoutes('*')).
  const staticMw = new StaticMiddleware()
  app.use((req: any, res: any, next: any) => staticMw.use(req, res, next))

  const port = process.env['PORT'] ?? GAME_CONSTANTS.BACKEND_PORT
  await app.listen(port, '0.0.0.0')
  console.info(`Backend running on http://localhost:${port}`)
  console.info(`Network info: GET http://localhost:${port}/api/network/info`)
}

void bootstrap()
