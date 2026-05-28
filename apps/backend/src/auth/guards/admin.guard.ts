import '../session.types'
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    // console.log(req.session, "fff")
    if (req.session?.isAdmin) return true
    throw new UnauthorizedException('Admin authentication required')
  }
}
