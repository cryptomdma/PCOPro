import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

type CreateUserInput = {
  name: string;
  email: string;
  role: Role;
  password: string;
  active?: boolean;
  technicianId?: string | null;
  createTechnician?: boolean;
};

type UpdateUserInput = {
  active?: boolean;
  role?: Role;
  technicianId?: string | null;
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        technicianId: true,
        technician: { select: { id: true, name: true } },
      },
    });
  }

  async create(input: CreateUserInput) {
    const name = (input.name ?? '').trim();
    const email = (input.email ?? '').trim().toLowerCase();
    const password = input.password ?? '';
    if (!name || !email || !password || !input.role) {
      throw new BadRequestException('Missing required fields');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    let technicianId = input.technicianId ?? null;
    let technicianCreated = false;
    let warning: string | undefined;

    if (input.role === Role.TECH) {
      if (technicianId) {
        const tech = await this.prisma.technician.findUnique({ where: { id: technicianId } });
        if (!tech) {
          throw new BadRequestException('Technician not found');
        }
      } else if (input.createTechnician !== false) {
        const tech = await this.prisma.technician.create({
          data: { name, active: true },
        });
        technicianId = tech.id;
        technicianCreated = true;
      } else {
        warning = 'TECH user created without technician link';
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const created = await this.prisma.user.create({
      data: {
        name,
        email,
        role: input.role,
        active: input.active ?? true,
        passwordHash: hash,
        technicianId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        technicianId: true,
      },
    });

    return { user: created, technicianCreated, technicianId, warning };
  }

  async update(id: string, input: UpdateUserInput) {
    if (input.technicianId) {
      const tech = await this.prisma.technician.findUnique({ where: { id: input.technicianId } });
      if (!tech) {
        throw new BadRequestException('Technician not found');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        active: input.active,
        role: input.role,
        technicianId: input.technicianId === undefined ? undefined : input.technicianId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        technicianId: true,
      },
    });
    return { user: updated };
  }
}
