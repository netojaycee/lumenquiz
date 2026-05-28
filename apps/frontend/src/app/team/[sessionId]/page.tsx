import { TeamClient } from './team-client'

export function generateStaticParams(): Array<{ sessionId: string }> {
  return [{ sessionId: '_' }]
}

export default function TeamPage(): React.ReactElement {
  return <TeamClient />
}
