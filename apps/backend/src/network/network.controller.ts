import { Controller, Get, Query } from '@nestjs/common'
import { NetworkService } from './network.service'
import { GAME_CONSTANTS } from '@apoquiz/shared-types'

@Controller('network')
export class NetworkController {
  constructor(private readonly network: NetworkService) {}

  @Get('info')
  getInfo() {
    const port = parseInt(process.env['PORT'] ?? String(GAME_CONSTANTS.BACKEND_PORT), 10)
    return {
      ip: this.network.getLocalIP(),
      port,
      joinURL: this.network.getJoinURL(),
    }
  }

  @Get('qr')
  async getQR(@Query('url') url?: string) {
    const target = url ?? this.network.getJoinURL()
    const dataURL = await this.network.generateQR(target)
    return { dataURL, url: target }
  }
}
