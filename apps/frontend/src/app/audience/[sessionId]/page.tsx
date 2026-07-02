import { AudienceClient } from './audience-client'

export function generateStaticParams(): Array<{ sessionId: string }> {
  return [{ sessionId: '_' }]
}

export default function AudiencePage(): React.ReactElement {
  return <AudienceClient />
}
