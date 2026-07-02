import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(userRole: string, userAreaName: string | null) {
    const whereCondition: any = {};
    
    // Non-admins can only see users within their areaName
    if (userRole !== 'ADMIN') {
      whereCondition.areaName = userAreaName;
    }

    return this.prisma.user.findMany({
      where: whereCondition,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        areaName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async suspendUser(userId: string, sender: { id: string; role: string; areaName?: string | null }) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    // Admins cannot be suspended
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('Admin accounts cannot be suspended');
    }

    // Self suspension forbidden
    if (target.id === sender.id) {
      throw new ForbiddenException('You cannot suspend your own account');
    }

    // Owner validation boundary: cannot suspend users from other areas
    if (sender.role !== 'ADMIN' && target.areaName !== sender.areaName) {
      throw new ForbiddenException('You can only suspend users in your own area');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: 'suspended' },
      select: { id: true, email: true, status: true },
    });
  }

  async reactivateUser(userId: string, sender: { role: string; areaName?: string | null }) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (sender.role !== 'ADMIN' && target.areaName !== sender.areaName) {
      throw new ForbiddenException('You can only reactivate users in your own area');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: 'active' },
      select: { id: true, email: true, status: true },
    });
  }

  async updateRole(userId: string, targetRole: 'OWNER' | 'MEMBER', sender: { role: string; areaName?: string | null }) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    // Admins are untouchable
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('Admin roles cannot be modified');
    }

    if (sender.role !== 'ADMIN' && target.areaName !== sender.areaName) {
      throw new ForbiddenException('You can only modify users in your own area');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: targetRole },
      select: { id: true, email: true, role: true },
    });
  }
}
