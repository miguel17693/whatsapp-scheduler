import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { ScheduleService } from './schedule.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [BotController],
  providers: [
    {
      provide: Client,
      useFactory: () => new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      }),
    },
    BotService,
    ScheduleService,
    EventEmitter2,
  ],
  exports: [ScheduleService],
})
export class BotModule {}
