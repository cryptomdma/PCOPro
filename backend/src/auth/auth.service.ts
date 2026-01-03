import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { technician: true } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const payload = { sub: user.id, role: user.role, technicianId: user.technicianId, email: user.email };
    const token = await this.jwt.signAsync(payload);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        technicianId: user.technicianId,
      },
    };
  }

  async bootstrapAdmin(secret?: string) {
    const existing = await this.prisma.user.count();
    if (existing > 0) {
      throw new BadRequestException('Users already exist');
    }
    if (secret && process.env.BOOTSTRAP_SECRET && secret !== process.env.BOOTSTRAP_SECRET) {
      throw new UnauthorizedException('Invalid bootstrap secret');
    }
    const email = process.env.ADMIN_EMAIL || 'admin@local';
    const password = process.env.ADMIN_PASSWORD || 'changeme';
    const hash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash: hash, name: 'Admin', role: 'ADMIN', active: true },
    });
    return { id: user.id, email: user.email };
  }
}
