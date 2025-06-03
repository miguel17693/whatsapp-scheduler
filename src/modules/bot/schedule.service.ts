import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Client } from 'whatsapp-web.js';
import { BotService } from './bot.service';

export interface ScheduledMessage {
  to: string;
  content: string;
  sendAt: Date;
  retryCount: number;
}

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private scheduledMessages: ScheduledMessage[] = [];
  private readonly MAX_RETRIES = 3;
  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private client: Client,
    @Inject(forwardRef(() => BotService))
    private botService: BotService,
  ) {
    this.setupCleanupInterval();
  }

  private setupCleanupInterval() {
    const interval = setInterval(() => this.checkScheduledMessages(), 60000);
    this.schedulerRegistry.addInterval('message-cleanup', interval);
  }

  addScheduledMessage(message: ScheduledMessage) {
    this.logger.log(
      `[addScheduledMessage] Adding message: ${JSON.stringify(message)}`,
    );
    this.scheduledMessages.push(message);
    this.logger.log(`Scheduled message to ${message.to} at ${message.sendAt}`);
    this.logger.log(
      `[addScheduledMessage] Current scheduledMessages length: ${this.scheduledMessages.length}`,
    );
  }

  private async checkScheduledMessages() {
    this.logger.verbose('Checking scheduled messages...');
    this.logger.verbose(
      `Current scheduled messages: ${JSON.stringify(this.scheduledMessages)}`,
    );
    const now = new Date();
    const messagesToKeep: ScheduledMessage[] = [];

    for (const msg of this.scheduledMessages) {
      this.logger.verbose(
        `Evaluating message to ${msg.to} scheduled for ${msg.sendAt}`,
      );
      if (msg.sendAt <= now) {
        try {
          this.logger.verbose(
            `Client exists: ${!!this.client}, BotService isConnected: ${this.botService.isConnected}`,
          );
          if (!this.client || !this.botService.isConnected) {
            this.logger.error('Client not available for message delivery - state:', {
              clientExists: !!this.client,
              isConnected: this.botService.isConnected,
            });
            this.logger.warn('Client not connected - skipping message delivery');
            messagesToKeep.push(msg);
            continue;
          }

          this.logger.log(`Attempting to send scheduled message to ${msg.to}`);
          await this.client.sendMessage(msg.to, msg.content).catch((error) => {
            this.logger.error('Message sending failed with error:', error.stack);
            throw error;
          });
          this.logger.log(`Successfully sent message to ${msg.to}`);
        } catch (error) {
          const retries = msg.retryCount || 0;
          if (retries < this.MAX_RETRIES) {
            this.logger.error(
              `Failed to send message to ${msg.to} (attempt ${retries + 1}/${this.MAX_RETRIES}): ${error.message}`,
            );
            messagesToKeep.push({
              ...msg,
              sendAt: new Date(Date.now() + 30000),
              retryCount: retries + 1,
            });
          } else {
            this.logger.error(
              `Permanently failed to send message to ${msg.to} after ${this.MAX_RETRIES} attempts`,
            );
          }
        }
      } else {
        messagesToKeep.push(msg);
      }
    }

    this.logger.verbose(
      `Messages to keep after check: ${JSON.stringify(messagesToKeep)}`,
    );
    this.scheduledMessages = messagesToKeep;
    this.logger.verbose(
      `[checkScheduledMessages] Updated scheduledMessages length: ${this.scheduledMessages.length}`,
    );
  }
}
