import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(userRole: string, userAreaName: string | null, filterArea?: string) {
    const whereCondition: any = {};

    if (userRole !== 'ADMIN') {
      whereCondition.areaName = userAreaName;
    } else if (filterArea === '__admins__') {
      whereCondition.areaName = null;
    } else if (filterArea) {
      whereCondition.areaName = filterArea;
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

  async listPendingInvites(userRole: string, userAreaName: string | null, filterArea?: string) {
    const whereCondition: any = { usedAt: null };

    if (userRole !== 'ADMIN') {
      whereCondition.areaName = userAreaName;
    } else if (filterArea === '__admins__') {
      whereCondition.areaName = null;
    } else if (filterArea) {
      whereCondition.areaName = filterArea;
    }

    return this.prisma.invitation.findMany({
      where: whereCondition,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        areaName: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelInvite(inviteId: string, sender: { role: string; areaName?: string | null }) {
    const invite = await this.prisma.invitation.findUnique({ where: { id: inviteId } });

    if (!invite || invite.usedAt) {
      throw new NotFoundException('Pending invitation not found');
    }

    if (sender.role !== 'ADMIN' && invite.areaName !== sender.areaName) {
      throw new ForbiddenException('You can only cancel invitations within your own area');
    }

    await this.prisma.invitation.delete({ where: { id: inviteId } });
    return { ok: true };
  }

  async deleteUser(userId: string, sender: { role: string }) {
    if (sender.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can delete users');
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (target.role === 'ADMIN') {
      throw new ForbiddenException('Admin accounts cannot be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.deleteMany({ where: { email: target.email } });
      await tx.user.delete({ where: { id: userId } });
    });

    return { ok: true };
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
