import { Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { ImportService } from './import.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('products')
  importProducts() {
    return this.importService.importProducts();
  }

  @Post('initial-stock')
  @UseGuards(JwtAuthGuard)
  importInitialStock(@CurrentUser() user: { userId: string; role: string }) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can import initial stock');
    }
    return this.importService.importInitialStock(undefined, user.userId);
  }
}
