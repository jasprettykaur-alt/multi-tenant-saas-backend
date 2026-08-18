import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INVITATIONS_QUEUE, InvitationsService } from './invitations.service';
import { InvitationsProcessor } from './invitations.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: { url: configService.get<string>('redis.url') },
      }),
    }),
    BullModule.registerQueue({ name: INVITATIONS_QUEUE }),
  ],
  providers: [InvitationsService, InvitationsProcessor],
  exports: [InvitationsService],
})
export class JobsModule {}
