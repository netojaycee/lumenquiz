import '../session.types'
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'
import { Request } from 'express'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    if (!req.session?.userId) {
      throw new UnauthorizedException('Authentication required')
    }
    if (req.session.userRole !== 'ADMIN') {
      throw new ForbiddenException('Admin role required')
    }
    return true
  }
}

