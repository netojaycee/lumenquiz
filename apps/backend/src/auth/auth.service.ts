import * as crypto from 'crypto'
import * as bcrypt from 'bcryptjs'
import { Injectable, Inject, ConflictException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { EmailProvider } from '../common/email/email-provider.interface'
import { InviteDto } from './dto/invite.dto'
import { SetupPasswordDto } from './dto/setup-password.dto'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { LoginDto } from './dto/login.dto'
import { User } from '@prisma/client'

@Injectable()
export class AuthService {
  private readonly configPath = require('path').join(process.cwd(), 'data', 'config.json')
  private adminPassword = process.env['ADMIN_PASSWORD'] ?? 'admin1234'
  private moderatorPin = process.env['MODERATOR_PIN'] ?? '1234'
  private cloudUrl = process.env['CLOUD_URL']
  private cloudApiKey = process.env['CLOUD_API_KEY']

  constructor(
    private readonly prisma: PrismaService,
    @Inject('EmailProvider') private readonly emailProvider: EmailProvider,
  ) {
    this.loadConfig()
  }

  private loadConfig(): void {
    try {
      const raw = require('fs').readFileSync(this.configPath, 'utf8')
      const saved = JSON.parse(raw)
      if (saved.adminPassword) this.adminPassword = saved.adminPassword
      if (saved.moderatorPin) this.moderatorPin = saved.moderatorPin
      if (saved.cloudUrl) this.cloudUrl = saved.cloudUrl
      if (saved.cloudApiKey) this.cloudApiKey = saved.cloudApiKey
    } catch {}
  }

  private saveConfig(): void {
    try {
      require('fs').mkdirSync(require('path').dirname(this.configPath), { recursive: true })
      const config = {
        adminPassword: this.adminPassword,
        moderatorPin: this.moderatorPin,
        cloudUrl: this.cloudUrl,
        cloudApiKey: this.cloudApiKey,
      }
      require('fs').writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8')
    } catch {}
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
      return crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }

  validateModeratorPin(pin: string): boolean {
    try {
      const a = Buffer.from(pin)
      const b = Buffer.from(this.moderatorPin)
      if (a.length !== b.length) return false
      return crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }


  async onModuleInit() {
    // Seed default admin if none exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@apoquiz.com'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234'
    
    const adminExists = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
    })

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10)
      await this.prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: 'Super Admin',
          role: 'ADMIN',
          areaName: null,
          status: 'active',
        },
      })
    }
  }

  async login(dto: LoginDto): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    })

    if (!user) {
      throw new BadRequestException('Invalid email or password')
    }

    if (user.status !== 'active') {
      throw new BadRequestException('Your account has been suspended')
    }

    if (!user.password) {
      throw new BadRequestException('Please complete account setup via setup-password link')
    }

    const matches = await bcrypt.compare(dto.password, user.password)
    if (!matches) {
      throw new BadRequestException('Invalid email or password')
    }

    return user
  }

  async invite(dto: InviteDto, sender: { role: string; areaName?: string | null }): Promise<{ ok: boolean }> {
    // If sender is OWNER, force their areaName on the invitation
    const targetArea = sender.role === 'ADMIN' ? dto.areaName : sender.areaName
    const targetEmail = dto.email.toLowerCase()

    // Validate email isn't already taken in User table
    const existingUser = await this.prisma.user.findUnique({
      where: { email: targetEmail },
    })
    if (existingUser) {
      throw new ConflictException('A user with this email address already exists')
    }

    // Generate secure registration invitation token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Upsert invitation token (update if previous invitation to same email pending)
    await this.prisma.invitation.upsert({
      where: { email: targetEmail },
      update: {
        name: dto.name,
        role: dto.role,
        areaName: targetArea || null,
        token,
        expiresAt,
        usedAt: null,
      },
      create: {
        email: targetEmail,
        name: dto.name,
        role: dto.role,
        areaName: targetArea || null,
        token,
        expiresAt,
      },
    })

    const appDomain = process.env.PUBLIC_URL || 'http://localhost:3000'
    const inviteLink = `${appDomain}/host/setup-password?token=${token}`

    // Compose HTML template
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; color: #333; }
          .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e1e4e8; }
          .header { background: linear-gradient(135deg, #4f46e5, #3b82f6); padding: 30px; text-align: center; color: #fff; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 40px 30px; line-height: 1.6; }
          .btn { background-color: #4f46e5; color: #ffffff !important; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block; margin: 20px 0; }
          .details { background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; }
          .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e1e4e8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>Apo Quiz Platform</h1></div>
          <div class="content">
            <p>Hello <strong>${dto.name}</strong>,</p>
            <p>You have been invited to join the Apo Quiz Platform as a <strong>${dto.role}</strong> for <strong>${targetArea || 'Global/Admin'}</strong>.</p>
            <p>Please click the button below to set up your account password and activate your access.</p>
            <div style="text-align: center;">
              <a href="${inviteLink}" class="btn">Set Up Password</a>
            </div>
            <div class="details">
              <strong>Invitation Details:</strong><br>
              • Area: ${targetArea || 'Global/Admin'}<br>
              • Role: ${dto.role}<br>
              • Link expiration: 24 hours
            </div>
          </div>
          <div class="footer">Sent by Apo Quiz Platform &copy; 2026</div>
        </div>
      </body>
      </html>
    `

    await this.emailProvider.sendMail({
      to: targetEmail,
      subject: `Invitation to join Apo Quiz as ${dto.role}`,
      html: htmlBody,
    })

    return { ok: true }
  }

  async verifyInvitation(token: string): Promise<any> {
    const invite = await this.prisma.invitation.findUnique({
      where: { token },
    })

    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invitation link is invalid or has expired')
    }

    return invite
  }

  async setupPassword(dto: SetupPasswordDto): Promise<{ ok: boolean }> {
    const invite = await this.verifyInvitation(dto.token)
    const hashedPassword = await bcrypt.hash(dto.password, 10)

    // Begin single database transaction for consistency
    await this.prisma.$transaction(async (tx) => {
      // Upsert User
      await tx.user.upsert({
        where: { email: invite.email },
        update: {
          password: hashedPassword,
          name: invite.name,
          role: invite.role,
          areaName: invite.areaName,
          status: 'active',
        },
        create: {
          email: invite.email,
          password: hashedPassword,
          name: invite.name,
          role: invite.role,
          areaName: invite.areaName,
          status: 'active',
        },
      })

      // Mark invitation as used
      await tx.invitation.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      })
    })

    return { ok: true }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: boolean }> {
    const emailLower = dto.email.toLowerCase()
    const user = await this.prisma.user.findUnique({
      where: { email: emailLower },
    })

    // Fail silently to prevent user enumeration attacks
    if (!user) {
      return { ok: true }
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour expiration

    await this.prisma.passwordReset.create({
      data: {
        email: emailLower,
        token,
        expiresAt,
      },
    })

    const appDomain = process.env.PUBLIC_URL || 'http://localhost:3000'
    const resetLink = `${appDomain}/host/reset-password?token=${token}`

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; background-color: #f4f5f7; margin: 0; padding: 0; color: #333; }
          .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e1e4e8; }
          .header { background: linear-gradient(135deg, #4f46e5, #3b82f6); padding: 30px; text-align: center; color: #fff; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 40px 30px; line-height: 1.6; }
          .btn { background-color: #4f46e5; color: #ffffff !important; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block; margin: 20px 0; }
          .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e1e4e8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h1>Reset Password</h1></div>
          <div class="content">
            <p>Hello,</p>
            <p>You requested a password reset for your Apo Quiz account.</p>
            <p>Click the button below to update your password. This link is valid for 1 hour.</p>
            <div style="text-align: center;">
              <a href="${resetLink}" class="btn">Reset Password</a>
            </div>
          </div>
          <div class="footer">Sent by Apo Quiz Platform &copy; 2026</div>
        </div>
      </body>
      </html>
    `

    await this.emailProvider.sendMail({
      to: emailLower,
      subject: 'Apo Quiz - Password Reset Request',
      html: htmlBody,
    })

    return { ok: true }
  }

  async verifyResetToken(token: string): Promise<any> {
    const record = await this.prisma.passwordReset.findUnique({
      where: { token },
    })

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Password reset token is invalid or has expired')
    }

    return record
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: boolean }> {
    const record = await this.verifyResetToken(dto.token)
    const hashedPassword = await bcrypt.hash(dto.password, 10)

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { email: record.email },
        data: { password: hashedPassword },
      })

      await tx.passwordReset.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      })
    })

    return { ok: true }
  }

  async changePassword(userId: string, newPassword: string): Promise<{ ok: boolean }> {
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })
    return { ok: true }
  }
}
