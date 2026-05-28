import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

function buildAdapter() {
  if (process.env.APP_MODE === 'cloud') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // const { Pool } = require('pg') as typeof import('pg');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // const { PrismaPg } = require('@prisma/adapter-pg') as typeof import('@prisma/adapter-pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return new PrismaPg(pool);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3') as typeof import('@prisma/adapter-better-sqlite3');
  const rawUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
  const filePath = rawUrl.replace(/^file:/, '');
  return new PrismaBetterSqlite3({ url: filePath });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: buildAdapter() });
  }

  async onModuleInit(): Promise<void> {
    const mode = process.env.APP_MODE === 'cloud' ? 'PostgreSQL' : 'SQLite';
    this.logger.log(`Connecting to ${mode} database…`);
    await this.$connect();
    this.logger.log('Database connected.');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database…');
    await this.$disconnect();
  }
}
