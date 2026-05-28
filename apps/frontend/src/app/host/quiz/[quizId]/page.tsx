import { OverviewClient } from './overview-client'


export function generateStaticParams(): Array<{ quizId: string }> {
  return [{ quizId: '_' }]
}

export default function QuizWorkspacePage(): React.ReactElement {
  return <OverviewClient />
}
