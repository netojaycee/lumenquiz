import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { AuthService } from '../auth.service'

@Injectable()
export class ModeratorGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const pin = req.headers['x-moderator-pin'] as string | undefined
    if (pin && this.auth.validateModeratorPin(pin)) return true
    throw new UnauthorizedException('Moderator PIN required')
  }
}
