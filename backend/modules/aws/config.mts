import type { NodeHttpHandler, NodeHttpHandlerOptions } from '@smithy/node-http-handler'
import { createAwsRequestHandler, AWS_SOCKET_TIMEOUT_MS } from '@vouchington/aws/request-handler'
import type { IncomingMessage } from 'node:http'

export const AWS_REGION = process.env.AWS_REGION ?? 'us-west-2'
export const BEDROCK_AWS_REGION = process.env.BEDROCK_AWS_REGION ?? 'us-east-1'

class AwsResponseBodyTimeoutError extends Error {
  override readonly name = 'TimeoutError'
  readonly code = 'ETIMEDOUT'
}

function isIncomingMessage(body: unknown): body is IncomingMessage {
  return typeof body === 'object' && body !== null && 'setTimeout' in body && 'socket' in body
}

function armResponseBodyTimeout(body: IncomingMessage, timeoutMs: number): void {
  const socket = body.socket
  const timeoutError = new AwsResponseBodyTimeoutError(
    `AWS response body was inactive for ${timeoutMs} ms`,
  )
  const onTimeout = () => body.destroy(timeoutError)
  let cleared = false
  const clear = () => {
    if (cleared) return
    cleared = true
    socket.removeListener('timeout', onTimeout)
    if (!socket.destroyed) socket.setTimeout(0)
  }

  body.setTimeout(timeoutMs, onTimeout)
  body.once('end', clear)
  body.once('close', clear)
}

// The application bounds bodies after headers; the platform owns SDK handler configuration.
export function createResponseBodyBoundAwsRequestHandler(
  overrides: NodeHttpHandlerOptions = {},
): NodeHttpHandler {
  const handler = createAwsRequestHandler(overrides)
  const handle = handler.handle
  const socketTimeout = overrides.socketTimeout ?? AWS_SOCKET_TIMEOUT_MS
  handler.handle = async (...args) => {
    const output = await handle.call(handler, ...args)
    if (socketTimeout > 0 && isIncomingMessage(output.response.body)) {
      armResponseBodyTimeout(output.response.body, socketTimeout)
    }
    return output
  }
  return handler
}
