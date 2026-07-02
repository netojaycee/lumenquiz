import '../session.types'
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    if (!req.session?.userId) {
      throw new UnauthorizedException('Authentication required')
    }
    
    // Check if the user was suspended in the database
    const user = await this.prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { status: true },
    })

    if (!user || user.status !== 'active') {
      req.session.destroy(() => undefined)
      throw new UnauthorizedException('Account has been suspended or deleted')
    }

    return true
  }
}
