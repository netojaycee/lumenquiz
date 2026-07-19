/**
 * Thin wrapper around the New Relic agent.
 *
 * The agent is only preloaded in the Docker runtime (`node -r newrelic`, see
 * the Dockerfile CMD). Importing it directly here would boot a second,
 * unconfigured agent during local development, so we read it out of the require
 * cache instead — every function below is a no-op unless the agent is genuinely
 * running.
 */

type CustomAttributes = Record<string, string | number | boolean>

interface NewRelicApi {
  noticeError: (error: Error, customAttributes?: CustomAttributes) => void
  shutdown: (
    options: { collectPendingData?: boolean; timeout?: number },
    callback: () => void,
  ) => void
}

function getAgent(): NewRelicApi | null {
  try {
    const resolved = require.resolve('newrelic')

    return (require.cache[resolved]?.exports as NewRelicApi | undefined) ?? null
  } catch {
    return null
  }
}

export function noticeError(error: Error, attributes: CustomAttributes = {}): void {
  getAgent()?.noticeError(error, attributes)
}

/**
 * Flushes pending telemetry, then invokes `done`.
 *
 * Used on the fatal path so a crash report is not lost to the agent's normal
 * harvest interval. The timeout guarantees we exit even if the flush hangs.
 */
export function flushTelemetry(done: () => void, timeoutMs = 3000): void {
  const agent = getAgent()
  if (!agent) return done()

  let finished = false
  const finishOnce = (): void => {
    if (finished) return
    finished = true
    done()
  }

  setTimeout(finishOnce, timeoutMs).unref()
  agent.shutdown({ collectPendingData: true, timeout: timeoutMs }, finishOnce)
}
