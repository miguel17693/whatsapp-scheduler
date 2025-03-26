import { forwardRef, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [BotController],
  providers: [
    BotService,
    ScheduleService,
    {
      provide: Client,
      useFactory: () => new Client({ authStrategy: new LocalAuth() })
    }
  ],
  exports: [ScheduleService]
})
export class BotModule {}
