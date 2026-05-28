import { Injectable } from '@nestjs/common'
import * as os from 'os'
import * as QRCode from 'qrcode'
import { GAME_CONSTANTS } from '@apoquiz/shared-types'

@Injectable()
export class NetworkService {
  getLocalIP(): string {
    const interfaces = os.networkInterfaces()
    const candidates: Array<{ ip: string; score: number; name: string }> = []

    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const iface of addrs ?? []) {
        if (iface.family !== 'IPv4' || iface.internal) continue
        if (!this.isPrivateIPv4(iface.address)) continue

        const n = name.toLowerCase()
        let score = 0

        // Strongly prefer physical Wi-Fi and Ethernet
        if (n.includes('wi-fi') || n.includes('wifi') || n.includes('wlan')) score += 40
        if (n.includes('ethernet') || n === 'eth0' || n === 'eth1') score += 35
        if (/^en\d/.test(n) || /^eth\d/.test(n)) score += 20

        // Penalise virtual / host-only adapters — cannot be reached from LAN devices
        if (n.includes('vmware') || n.includes('vmnet')) score -= 60
        if (n.includes('virtualbox') || n.includes('vbox') || n.includes('host-only')) score -= 60
        if (n.includes('hyper-v') || n.includes('vethernet')) score -= 60
        if (n.includes('docker') || n.includes('bridge')) score -= 50
        if (n.includes('vpn') || n.includes('tunnel') || n.includes('tun') || n.includes('tap')) score -= 40
        if (n.includes('bluetooth')) score -= 30
        if (n.includes('virtual') || n.includes('pseudo')) score -= 40
        if (n.includes('loopback')) score -= 100

        // Slight preference for the most common home/office subnet
        if (iface.address.startsWith('192.168.')) score += 10
        else if (iface.address.startsWith('10.')) score += 5

        candidates.push({ ip: iface.address, score, name })
      }
    }

    if (candidates.length === 0) return '127.0.0.1'
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0].ip
  }

  private isPrivateIPv4(ip: string): boolean {
    return (
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    )
  }

  getBaseUrl(): string {
    // PUBLIC_URL overrides LAN detection — used when running on a cloud server.
    const publicUrl = process.env['PUBLIC_URL']
    if (publicUrl) return publicUrl.replace(/\/$/, '')
    const ip = this.getLocalIP()
    const port = process.env['PORT'] ?? String(GAME_CONSTANTS.BACKEND_PORT)
    return `http://${ip}:${port}`
  }

  getJoinURL(sessionId?: string): string {
    const base = this.getBaseUrl()
    return sessionId ? `${base}/join?session=${sessionId}` : `${base}/join`
  }

  async generateQR(url: string): Promise<string> {
    return QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
  }
}
