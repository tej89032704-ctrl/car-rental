import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/guards';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private notifier: NotificationsService) {}

  @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @Get('notifications/mine')
  async mine(@Req() req: any) {
    return await this.notifier.listForUser(req.user.id);
  }

  @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('notifications/read-all')
  async readAll(@Req() req: any) {
    return await this.notifier.markAllRead(req.user.id);
  }

  @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @HttpCode(200) @Post('notifications/:id/read')
  async read(@Req() req: any, @Param('id') id: string) {
    return await this.notifier.markRead(req.user.id, id);
  }
}
