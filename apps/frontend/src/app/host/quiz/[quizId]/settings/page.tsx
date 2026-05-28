import { SettingsClient } from './settings-client'

export function generateStaticParams(): Array<{ quizId: string }> {
  return [{ quizId: '_' }]
}

export default function QuizSettingsPage(): React.ReactElement {
  return <SettingsClient />
}
