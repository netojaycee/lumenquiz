import { TeamsClient } from './teams-client'

export function generateStaticParams(): Array<{ quizId: string }> {
  return [{ quizId: '_' }]
}

export default function TeamsPage(): React.ReactElement {
  return <TeamsClient />
}
