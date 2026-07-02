import { ResultsClient } from './results-client'

export function generateStaticParams(): Array<{ sessionId: string }> {
  return [{ sessionId: '_' }]
}

export default function ResultsPage(): React.ReactElement {
  return <ResultsClient />
}
