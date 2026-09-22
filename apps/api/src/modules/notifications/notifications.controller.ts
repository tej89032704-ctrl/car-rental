import { Controller, Get, Req } from '@nestjs/common';
import { Roles } from '../../common/auth/guards';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private notifier: NotificationsService) {}

  @Roles('super_admin', 'car_owner', 'car_renter', 'agent') @Get('notifications/mine')
  mine(@Req() req: any) {
    return this.notifier.listForUser(req.user.id);
  }
}
