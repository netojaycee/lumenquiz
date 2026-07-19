import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { MESSAGE_METADATA } from '@nestjs/websockets/constants'
import { Observable } from 'rxjs'
import type { Socket } from 'socket.io'
import { noticeError, runInBackgroundTransaction } from './newrelic'

/**
 * Reports each Socket.IO message handler as a New Relic transaction.
 *
 * The agent instruments HTTP frameworks, not Socket.IO, so without this every
 * `@SubscribeMessage` handler — and the queries and errors inside it — is
 * invisible. Only the initial polling handshake shows up as a web transaction.
 */
@Injectable()
export class NewRelicWsInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'ws') return next.handle()

    // The event name comes from @SubscribeMessage, giving stable transaction
    // names. Falling back to the method name keeps unnamed handlers reportable.
    const eventName =
      this.reflector.get<string>(MESSAGE_METADATA, context.getHandler()) ??
      context.getHandler().name

    const client = context.switchToWs().getClient<Socket>()
    const sessionId = (client?.data?.sessionId as string | undefined) ?? 'unknown'
    const role = (client?.data?.role as string | undefined) ?? 'unknown'

    return new Observable((subscriber) => {
      let unsubscribe = (): void => undefined

      // The handler only runs once next.handle() is subscribed to, so the
      // subscription has to happen inside the transaction callback — that is
      // what puts the handler's async context under the transaction and lets
      // its Prisma queries attach as child segments.
      runInBackgroundTransaction(
        `ws:${eventName}`,
        'WebSocket',
        { sessionId, role },
        () =>
          new Promise<void>((settled) => {
            const subscription = next.handle().subscribe({
              next: (value) => subscriber.next(value),
              error: (error: unknown) => {
                // Nest's default WS handling swallows this into an 'exception'
                // event to the client, so New Relic would never see it.
                noticeError(error instanceof Error ? error : new Error(String(error)), {
                  event: eventName,
                  sessionId,
                })

                subscriber.error(error)
                settled()
              },
              complete: () => {
                subscriber.complete()
                settled()
              },
            })

            unsubscribe = () => subscription.unsubscribe()
          }),
      )

      return () => unsubscribe()
    })
  }
}
