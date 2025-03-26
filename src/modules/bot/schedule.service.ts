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
        private botService: BotService
    ) {
        this.setupCleanupInterval();
    }

    private setupCleanupInterval() {
        const interval = setInterval(() => this.checkScheduledMessages(), 60000);
        this.schedulerRegistry.addInterval('message-cleanup', interval);
    }

    addScheduledMessage(message: ScheduledMessage) {
        this.scheduledMessages.push(message);
        this.logger.log(`Scheduled message to ${message.to} at ${message.sendAt}`);
    }

    private async checkScheduledMessages() {
        const now = new Date();
        const messagesToKeep: ScheduledMessage[] = [];

        for (const msg of this.scheduledMessages) {
            if (msg.sendAt <= now) {
                try {
                    if (!this.botService.isConnected) {
                        this.logger.warn('Client not connected - skipping message delivery');
                        messagesToKeep.push(msg);
                        continue;
                    }

                    this.logger.log(`Attempting to send scheduled message to ${msg.to}`);
                    
                    await this.client.sendMessage(msg.to, msg.content);
                    this.logger.log(`Successfully sent message to ${msg.to}`);
                } catch (error) {
                    const retries = msg.retryCount || 0;
                    if (retries < this.MAX_RETRIES) {
                        this.logger.error(`Failed to send message to ${msg.to} (attempt ${retries + 1}/${this.MAX_RETRIES}): ${error.message}`);
                        messagesToKeep.push({
                            ...msg,
                            sendAt: new Date(Date.now() + 30000),
                            retryCount: retries + 1
                        });
                    } else {
                        this.logger.error(`Permanently failed to send message to ${msg.to} after ${this.MAX_RETRIES} attempts`);
                    }
                }
            } else {
                messagesToKeep.push(msg);
            }
        }

        this.scheduledMessages = messagesToKeep;
    }
}