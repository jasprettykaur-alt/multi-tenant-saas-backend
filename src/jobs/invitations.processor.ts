import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { INVITATIONS_QUEUE, InvitationJobData } from './invitations.service';

@Processor(INVITATIONS_QUEUE)
export class InvitationsProcessor extends WorkerHost {
  private readonly logger = new Logger(InvitationsProcessor.name);

  async process(job: Job<InvitationJobData>): Promise<void> {
    const { email, name, tenantName } = job.data;

    // Stand-in for a real email provider (SES/SendGrid/etc). Demonstrates the
    // async API -> queue -> worker workflow requested in Section 16.
    this.logger.log(`Sending invitation email to ${email} (${name}) for tenant "${tenantName}"`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    this.logger.log(`Invitation email sent to ${email}`);
  }
}
