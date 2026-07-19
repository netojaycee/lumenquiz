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

interface TransactionHandle {
  end: () => void
}

interface NewRelicApi {
  noticeError: (error: Error, customAttributes?: CustomAttributes) => void
  addCustomAttributes: (attributes: CustomAttributes) => void
  getTransaction: () => TransactionHandle
  startBackgroundTransaction: (
    name: string,
    group: string,
    handle: () => void | Promise<void>,
  ) => void
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
 * Runs `task` as its own New Relic background transaction.
 *
 * Timer callbacks fire long after the socket handler that scheduled them has
 * returned, so they have no transaction to attach to and their queries and
 * errors would otherwise go unreported. Each one becomes a separate transaction
 * rather than being folded into the handler, whose duration would then include
 * the whole quiz timer.
 *
 * Without a running agent this just calls `task` directly.
 */
export function runInBackgroundTransaction(
  name: string,
  group: string,
  attributes: CustomAttributes,
  task: () => void | Promise<void>,
): void {
  const agent = getAgent()
  if (!agent) return void task()

  agent.startBackgroundTransaction(name, group, () => {
    const transaction = agent.getTransaction()
    agent.addCustomAttributes(attributes)

    const result = task()

    if (result instanceof Promise) {
      return result.finally(() => transaction.end())
    }

    transaction.end()
    return undefined
  })
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
