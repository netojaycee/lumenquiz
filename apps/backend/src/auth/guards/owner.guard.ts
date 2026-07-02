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
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    if (!req.session?.userId) {
      throw new UnauthorizedException('Authentication required')
    }
    const role = req.session.userRole
    if (role !== 'ADMIN' && role !== 'OWNER') {
      throw new ForbiddenException('Owner or Admin role required')
    }
    return true
  }
}
