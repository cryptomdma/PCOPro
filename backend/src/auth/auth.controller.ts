import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('bootstrap-admin')
  bootstrap(@Headers('x-bootstrap-secret') secret?: string) {
    return this.auth.bootstrapAdmin(secret);
  }
}
