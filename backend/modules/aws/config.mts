import { NodeHttpHandler, type NodeHttpHandlerOptions } from '@smithy/node-http-handler'
import type { IncomingMessage } from 'node:http'

export const AWS_REGION = process.env.AWS_REGION ?? 'us-west-2'
export const BEDROCK_AWS_REGION = process.env.BEDROCK_AWS_REGION ?? 'us-east-1'

export const AWS_CONNECTION_TIMEOUT_MS = 3_000
export const AWS_SOCKET_TIMEOUT_MS = 10_000
// SQS receives wait up to 20 seconds by protocol; keep the transport idle deadline above that.
export const AWS_SQS_SOCKET_TIMEOUT_MS = 25_000

class AwsNodeHttpHandler extends NodeHttpHandler {
  readonly #socketTimeout: number

  constructor(options: NodeHttpHandlerOptions) {
    super(options)
    this.#socketTimeout = options.socketTimeout ?? 0
  }

  override async handle(...args: Parameters<NodeHttpHandler['handle']>) {
    const output = await super.handle(...args)
    if (this.#socketTimeout > 0 && isIncomingMessage(output.response.body)) {
      armResponseBodyTimeout(output.response.body, this.#socketTimeout)
    }
    return output
  }
}

function isIncomingMessage(body: unknown): body is IncomingMessage {
  return typeof body === 'object' && body !== null && 'setTimeout' in body && 'socket' in body
}

function armResponseBodyTimeout(body: IncomingMessage, timeoutMs: number): void {
  const socket = body.socket
  const timeoutError = Object.assign(
    new Error(`AWS response body was inactive for ${timeoutMs} ms`),
    { name: 'TimeoutError', code: 'ETIMEDOUT' },
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

export function createAwsRequestHandler(overrides: NodeHttpHandlerOptions = {}): NodeHttpHandler {
  const options = {
    connectionTimeout: AWS_CONNECTION_TIMEOUT_MS,
    socketTimeout: AWS_SOCKET_TIMEOUT_MS,
    ...overrides,
  }
  return new AwsNodeHttpHandler(options)
}

// Bedrock's generated api.aws endpoint names are not live. Opt supported clients in explicitly
// instead of using AWS_USE_DUALSTACK_ENDPOINT globally.
export const AWS_DUALSTACK_CLIENT_CONFIG = { useDualstackEndpoint: true } as const
