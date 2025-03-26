import { Controller, Get, Post, Res, Body } from '@nestjs/common';
import { BotService } from './bot.service';
import * as QRCode from 'qrcode';
import { Response } from 'express';
import { OnEvent } from '@nestjs/event-emitter';

import { ScheduleService, ScheduledMessage } from './schedule.service';

@Controller('bot')
export class BotController {
  private qrCode: string;
  constructor(
    private botService: BotService,
    private scheduleService: ScheduleService
  ) {}

  @OnEvent('qrcode.created')
  handleQrcodeCreatedEvent(qrCode: string) {
    this.qrCode = qrCode;
  }

  @Get('qrcode')
  async getQrCode(@Res() response: Response) {
    if (!this.qrCode) {
      return response.status(404).send('QR code not found');
    }

    response.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(response, this.qrCode, (error) => {
      if (error) {
        console.error('QRCode generation error:', error);
        response.status(500).send('Error generating QR code');
      }
    });
  }

  @Post('schedule')
  async scheduleMessage(@Body() message: ScheduledMessage) {
    this.scheduleService.addScheduledMessage(message);
    return { status: 'scheduled', sendAt: message.sendAt };
  }
}
