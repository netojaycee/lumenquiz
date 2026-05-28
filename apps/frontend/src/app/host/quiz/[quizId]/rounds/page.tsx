import { RoundsClient } from './rounds-client'

export function generateStaticParams(): Array<{ quizId: string }> {
  return [{ quizId: '_' }]
}

export default function RoundsPage(): React.ReactElement {
  return <RoundsClient />
}
