import { ScreenClient } from './screen-client'

export function generateStaticParams(): Array<{ sessionId: string }> {
  return [{ sessionId: '_' }]
}

export default function ScreenPage(): React.ReactElement {
  return <ScreenClient />
}
