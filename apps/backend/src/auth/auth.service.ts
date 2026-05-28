import './session.types'
import * as path from 'path'
import * as fs from 'fs'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'crypto'

interface AuthConfig {
  adminPassword: string
  moderatorPin: string
  cloudUrl?: string
  cloudApiKey?: string
}

@Injectable()
export class AuthService {
  private readonly configPath = path.join(process.cwd(), 'data', 'config.json')
  private adminPassword: string
  private moderatorPin: string
  private cloudUrl: string | undefined
  private cloudApiKey: string | undefined

  constructor() {
    const saved = this.loadConfig()
    // Saved file wins over env vars; env vars win over hardcoded defaults
    this.adminPassword = saved.adminPassword ?? process.env['ADMIN_PASSWORD'] ?? 'admin1234'
    this.moderatorPin = saved.moderatorPin ?? process.env['MODERATOR_PIN'] ?? '1234'
    this.cloudUrl = saved.cloudUrl ?? process.env['CLOUD_URL']
    this.cloudApiKey = saved.cloudApiKey ?? process.env['CLOUD_API_KEY']
  }

  private loadConfig(): Partial<AuthConfig> {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf8')
      return JSON.parse(raw) as Partial<AuthConfig>
    } catch {
      return {}
    }
  }

  private saveConfig(): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true })
    const config: AuthConfig = {
      adminPassword: this.adminPassword,
      moderatorPin: this.moderatorPin,
      cloudUrl: this.cloudUrl,
      cloudApiKey: this.cloudApiKey,
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8')
  }

  getCloudUrl(): string | undefined {
    return this.cloudUrl
  }

  getCloudApiKey(): string | undefined {
    return this.cloudApiKey
  }

  setCloudConfig(cloudUrl: string, cloudApiKey?: string): void {
    this.cloudUrl = cloudUrl || undefined
    if (cloudApiKey) this.cloudApiKey = cloudApiKey
    this.saveConfig()
  }

  validateAdminPassword(password: string): boolean {
    try {
      const a = Buffer.from(password)
      const b = Buffer.from(this.adminPassword)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  validateModeratorPin(pin: string): boolean {
    try {
      const a = Buffer.from(pin)
      const b = Buffer.from(this.moderatorPin)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  login(): { ok: boolean } {
    return { ok: true }
  }

  throwIfInvalidAdmin(password: string): void {
    if (!this.validateAdminPassword(password)) {
      throw new UnauthorizedException('Invalid admin password')
    }
  }

  changeAdminPassword(currentPassword: string, newPassword: string): void {
    if (!this.validateAdminPassword(currentPassword)) {
      throw new UnauthorizedException('Current password is incorrect')
    }
    if (!newPassword || newPassword.length < 6) {
      throw new UnauthorizedException('New password must be at least 6 characters')
    }
    this.adminPassword = newPassword
    this.saveConfig()
  }

  changeModeratorPin(newPin: string): void {
    if (!newPin || !/^\d{4}$/.test(newPin)) {
      throw new UnauthorizedException('PIN must be exactly 4 digits')
    }
    this.moderatorPin = newPin
    this.saveConfig()
  }
}
