import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  public readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis(this.configService.get<string>('redis.url')!, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  /** Namespaced key so cache entries always carry tenant context (see Section 14). */
  static tenantKey(tenantId: string, ...parts: (string | number)[]): string {
    return ['tenant', tenantId, ...parts].join(':');
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** Invalidate every cached entry for a tenant + resource prefix, e.g. tenant:{id}:projects* */
  async delByPrefix(prefix: string): Promise<void> {
    const stream = this.client.scanStream({ match: `${prefix}*`, count: 100 });
    const pipeline = this.client.pipeline();
    let found = false;
    for await (const keys of stream) {
      for (const key of keys as string[]) {
        pipeline.del(key);
        found = true;
      }
    }
    if (found) {
      await pipeline.exec();
    }
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
