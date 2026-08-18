import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface InvitationJobData {
  email: string;
  name: string;
  tenantName: string;
}

export const INVITATIONS_QUEUE = 'invitations';

@Injectable()
export class InvitationsService {
  constructor(@InjectQueue(INVITATIONS_QUEUE) private readonly queue: Queue<InvitationJobData>) {}

  async enqueueInvitation(data: InvitationJobData) {
    await this.queue.add('send-invitation-email', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }
}
