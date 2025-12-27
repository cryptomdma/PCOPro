import { Controller, Post } from '@nestjs/common';
import { ImportService } from './import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('products')
  importProducts() {
    return this.importService.importProducts();
  }
}
