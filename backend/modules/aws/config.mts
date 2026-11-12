import type { NodeHttpHandler, NodeHttpHandlerOptions } from '@smithy/node-http-handler'
import { createAwsRequestHandler, AWS_SOCKET_TIMEOUT_MS } from '@vouchington/aws/request-handler'
import type { IncomingMessage } from 'node:http'
import { Readable } from 'node:stream'

export const AWS_REGION = process.env.AWS_REGION ?? 'us-west-2'

class AwsResponseBodyTimeoutError extends Error {
  override readonly name = 'TimeoutError'
  readonly code = 'ETIMEDOUT'
}

function isIncomingMessage(body: unknown): body is IncomingMessage {
  return typeof body === 'object' && body !== null && 'setTimeout' in body && 'socket' in body
}

function armResponseBodyTimeout(body: IncomingMessage, timeoutMs: number): void {
  const socket = body.socket
  if (socket === null) return

  const timeoutError = new AwsResponseBodyTimeoutError(
    `AWS response body was inactive for ${timeoutMs} ms`,
  )
  let released = false
  // An abandoned body has no error listener; destroying it with an error would
  // surface as an uncaught exception, so it only releases the socket.
  const onTimeout = () => {
    if (body.listenerCount('error') === 0) body.destroy()
    else body.destroy(timeoutError)
  }
  const release = () => {
    if (released) return
    released = true
    Reflect.deleteProperty(socket, 'setTimeout')
    socket.removeListener('timeout', onTimeout)
    if (!socket.destroyed) socket.setTimeout(0)
  }

  // The SDK leaves its idle-timeout listener armed after headers and destroys an
  // incomplete body with a TimeoutError that has no code. Windows of at least
  // 6000 ms register again after 3000 ms and would restart this timer. Activity
  // still refreshes the socket timer directly, so a live transfer is unaffected.
  socket.removeAllListeners('timeout')
  socket.setTimeout(timeoutMs, onTimeout)
  const setSocketTimeout = socket.setTimeout
  Object.defineProperty(socket, 'setTimeout', {
    configurable: true,
    writable: true,
    value: (timeout: number, callback?: () => void) => {
      if (released) return setSocketTimeout.call(socket, timeout, callback)
      return socket
    },
  })

  body.once('end', release)
  body.once('close', release)
}

// Releases the socket of a response body the caller will not read.
export function discardAwsResponseBody(body: unknown): void {
  if (body instanceof Readable) body.destroy()
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
