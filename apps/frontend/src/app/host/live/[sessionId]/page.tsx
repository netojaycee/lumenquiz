import { LiveClient } from './live-client'

export function generateStaticParams(): Array<{ sessionId: string }> {
  return [{ sessionId: '_' }]
}

export default function LiveMonitorPage(): React.ReactElement {
  return <LiveClient />
}
