import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client } from 'whatsapp-web.js';
import * as chrono from 'chrono-node';
import { ScheduleService } from './schedule.service';

@Injectable()
export class BotService implements OnModuleInit {
  @Inject(Client) private client: Client;
  private readonly logger = new Logger(BotService.name);
  public isConnected = false;

  constructor(
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => ScheduleService))
    private scheduleService: ScheduleService,
  ) {}

  onModuleInit() {
    this.client.on('qr', (qr) => {
      this.logger.log(`QrCode: http://localhost:${3000}/bot/qrcode`);
      this.eventEmitter.emit('qrcode.created', qr);
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      this.logger.log("You're connected successfully!");
    });

    this.client.on('disconnected', (reason) => {
      this.isConnected = false;
      this.logger.warn('Client disconnected:', reason);
    });

    this.client.on('message', async (msg) => {
      const isGroup = msg.from.endsWith('@g.us');
      this.logger.verbose(
        `Received ${isGroup ? 'group' : 'private'} message from ${msg.from}: ${msg.body}`,
      );

      // Handle other messages
      if (msg.body && msg.body.length > 0) {
        // Default message handling
        //msg.reply(`Received: ${msg.body}`);
      }

      // Existing ping command
      if (msg.body === '!ping') {
        msg.reply('pong');
      }
    });

    this.client.on('message_ack', async (msg, ack) => {
      this.logger.verbose(`You've just written: ${msg.body}`);

      if (msg.body.toLowerCase().startsWith('scheduler')) {
        {
          const jsonStr = msg.body.slice(9).trim();
          try {
            const data = JSON.parse(jsonStr);

            const whatsappIdRegex = /^\d+(@[cg]\.us)?$/;
            if (
              !data.to ||
              !whatsappIdRegex.test(data.to) ||
              !data.message ||
              !data.when
            ) {
              msg.reply('⚠️ Missing required fields: to, message, when');
              return;
            }

            if (!data.to.includes('@')) {
              data.to += '@c.us';
            }

            const sendAt = chrono.parseDate(data.when);
            if (!sendAt) {
              msg.reply('⚠️ Invalid time format in "when" field');
              return;
            }

            try {
              await this.client.getChatById(data.to);
              this.scheduleService.addScheduledMessage({
                to: data.to,
                content: data.message,
                sendAt,
                retryCount: 0,
              });
              msg.reply(`✅ Message scheduled for ${sendAt.toLocaleString()}`);
            } catch (error) {
              if (error.message.includes('not found')) {
                msg.reply('⚠️ Phone number not registered on WhatsApp');
              } else {
                this.logger.error('API Error verifying number:', error);
                msg.reply('⚠️ Error verifying number - please try later');
              }
            }
          } catch (error) {
            this.logger.error(
              'Failed to parse scheduler command:',
              error.message,
            );
            msg.reply(
              '⚠️ Invalid JSON format. Example: scheduler { "to": "1234567890@c.us", "message": "Reminder", "when": "tomorrow at 3pm" }',
            );
          }
        }
      }
    });

    this.client.on('*', (event, ...args) => {
      this.logger.debug(`Client event: ${event}`, args);
    });

    this.client.on('auth_failure', (msg) => {
      this.logger.error('Authentication failure:', msg);
    });

    this.client.on('disconnected', (reason) => {
      this.logger.warn('Client disconnected:', reason);
    });

    try {
      this.client.initialize();
      this.logger.log('WhatsApp client initialization started');
    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp client:', error);
    }
  }
}
