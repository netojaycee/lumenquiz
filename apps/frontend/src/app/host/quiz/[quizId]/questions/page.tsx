import { QuestionsClient } from './questions-client'

export function generateStaticParams(): Array<{ quizId: string }> {
  return [{ quizId: '_' }]
}

export default function QuestionsPage(): React.ReactElement {
  return <QuestionsClient />
}
