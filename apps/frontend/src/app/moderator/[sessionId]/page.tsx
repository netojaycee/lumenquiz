import { ModeratorClient } from './moderator-client'

export function generateStaticParams(): Array<{ sessionId: string }> {
  return [{ sessionId: '_' }]
}

export default function ModeratorPage(): React.ReactElement {
  return <ModeratorClient />
}
