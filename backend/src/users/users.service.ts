import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  licenseNumber?: string | null;
};

type UpdateUserInput = {
  name?: string;
  email?: string;
  active?: boolean;
  role?: Role;
  technicianId?: string | null;
  createTechnician?: boolean;
  licenseNumber?: string | null;
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
        technician: { select: { id: true, name: true, licenseNumber: true } },
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
    const licenseNumber = (input.licenseNumber ?? '').trim().slice(0, 10) || null;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    let technicianId = input.technicianId ?? null;
    let technicianCreated = false;

    if (input.role === Role.TECH) {
      if (technicianId) {
        const tech = await this.prisma.technician.findUnique({ where: { id: technicianId } });
        if (!tech) {
          throw new BadRequestException('Technician not found');
        }
      } else if (input.createTechnician !== false) {
        if (!licenseNumber) {
          throw new BadRequestException('License number is required when creating a Technician record.');
        }
        const tech = await this.prisma.technician.create({
          data: { name, active: true, licenseNumber },
        });
        technicianId = tech.id;
        technicianCreated = true;
      } else {
        throw new BadRequestException('TECH users must be linked to a Technician record.');
      }
    } else if (technicianId) {
      const tech = await this.prisma.technician.findUnique({ where: { id: technicianId } });
      if (!tech) {
        throw new BadRequestException('Technician not found');
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

    return { user: created, technicianCreated, technicianId };
  }

  async update(id: string, input: UpdateUserInput) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, technicianId: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const nextName = input.name === undefined ? existing.name : (input.name ?? '').trim();
    const nextEmail =
      input.email === undefined ? existing.email : (input.email ?? '').trim().toLowerCase();
    if (!nextName || !nextEmail) {
      throw new BadRequestException('Name and email are required');
    }

    if (nextEmail !== existing.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: nextEmail } });
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    const nextRole = input.role ?? existing.role;
    let nextTechnicianId = input.technicianId === undefined ? existing.technicianId : input.technicianId;
    const licenseNumber = (input.licenseNumber ?? '').trim().slice(0, 10) || null;

    if (nextRole === Role.TECH) {
      if (nextTechnicianId) {
        const tech = await this.prisma.technician.findUnique({ where: { id: nextTechnicianId } });
        if (!tech) {
          throw new BadRequestException('Technician not found');
        }
      } else if (input.createTechnician) {
        if (!licenseNumber) {
          throw new BadRequestException('License number is required when creating a Technician record.');
        }
        const tech = await this.prisma.technician.create({
          data: { name: nextName, active: true, licenseNumber },
        });
        nextTechnicianId = tech.id;
      } else {
        throw new BadRequestException('TECH users must be linked to a Technician record.');
      }
    } else if (nextTechnicianId) {
      const tech = await this.prisma.technician.findUnique({ where: { id: nextTechnicianId } });
      if (!tech) {
        throw new BadRequestException('Technician not found');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: nextName,
        email: nextEmail,
        active: input.active,
        role: nextRole,
        technicianId: nextTechnicianId,
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
