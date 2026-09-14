import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Metadata } from '@grpc/grpc-js';
import { timingSafeEqual } from 'node:crypto';

const INTERNAL_KEY_METADATA_FIELD = 'x-internal-key';

@Injectable()
export class InternalGrpcAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata = context.switchToRpc().getContext<Metadata>();
    const providedRaw = metadata.get(INTERNAL_KEY_METADATA_FIELD)[0];
    const expectedRaw = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    // Проверяем наличие ключа в заголовках
    if (typeof providedRaw !== 'string' || !providedRaw) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }

    // Создаем буферы из переданного и ожидаемого ключей
    const providedBuffer = Buffer.from(providedRaw);
    const expectedBuffer = Buffer.from(expectedRaw);

    // timingSafeEqual падает с ошибкой, если буферы разной длины.
    // Если длины не совпадают, сравнение сразу считается неудачным.
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }

    return true;
  }
}
