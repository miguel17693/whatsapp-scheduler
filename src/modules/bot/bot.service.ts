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
  ) {
    this.logger.log('BotService constructor called');
  }

  onModuleInit() {
    this.logger.log('onModuleInit called');
    this.logger.log('Client instance:', this.client ? 'DEFINED' : 'UNDEFINED');
    if (!this.client) {
      this.logger.error(
        'WhatsApp Client is not defined! Make sure it is provided in your module.',
      );
      return;
    }

    this.logger.log('Registering QR event handler');
    this.client.on('qr', (qr) => {
      this.logger.log('QR event fired');
      this.logger.log(`Scan this QR code to log in:`);
      this.logger.log(qr); // Add this line
      this.logger.log(`Or visit: http://localhost:${3000}/bot/qrcode`);
      this.eventEmitter.emit('qrcode.created', qr);
    });

    this.logger.log('Registering READY event handler');
    this.client.on('ready', () => {
      this.logger.log('READY event fired');
      this.isConnected = true;
      this.logger.log("You're connected successfully!");
    });

    this.logger.log('Registering DISCONNECTED event handler');
    this.client.on('disconnected', (reason) => {
      this.logger.log('DISCONNECTED event fired');
      this.isConnected = false;
      this.logger.warn('Client disconnected:', reason);
    });

    this.logger.log('Registering MESSAGE event handler');
    this.client.on('message', async (msg) => {
      const isGroup = msg.from.endsWith('@g.us');
      this.logger.log(
        `Received ${isGroup ? 'group' : 'private'} message from ${msg.from}: ${msg.body}`,
      );
      this.logger.log('Message object:', JSON.stringify(msg));

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

    this.logger.log('Registering MESSAGE_ACK event handler');
    this.client.on('message_ack', async (msg, ack) => {
      this.logger.log(`You've just written: ${msg.body}`);
      this.logger.log('Message ACK object:', JSON.stringify(msg));

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

    this.logger.log('Registering wildcard event handler');
    this.client.on('*', (event, ...args) => {
      this.logger.debug(`Client event: ${event}`, args);
    });

    this.logger.log('Registering AUTH_FAILURE event handler');
    this.client.on('auth_failure', (msg) => {
      this.logger.log('AUTH_FAILURE event fired');
      this.logger.error('Authentication failure:', msg);
    });

    try {
      this.logger.log('Calling client.initialize()');
      this.client.initialize();
      this.logger.log('WhatsApp client initialization started');
    } catch (error) {
      this.logger.error('Failed to initialize WhatsApp client:', error);
    }
  }
}
