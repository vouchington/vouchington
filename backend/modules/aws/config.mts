import { NodeHttpHandler, type NodeHttpHandlerOptions } from '@smithy/node-http-handler'

export const AWS_REGION = process.env.AWS_REGION ?? 'us-west-2'
export const BEDROCK_AWS_REGION = process.env.BEDROCK_AWS_REGION ?? 'us-east-1'

export const AWS_CONNECTION_TIMEOUT_MS = 3_000
export const AWS_SOCKET_TIMEOUT_MS = 10_000
// SQS receives wait up to 20 seconds by protocol; keep the transport idle deadline above that.
export const AWS_SQS_SOCKET_TIMEOUT_MS = 25_000

export function createAwsRequestHandler(overrides: NodeHttpHandlerOptions = {}): NodeHttpHandler {
  return new NodeHttpHandler({
    connectionTimeout: AWS_CONNECTION_TIMEOUT_MS,
    socketTimeout: AWS_SOCKET_TIMEOUT_MS,
    ...overrides,
  })
}

// Bedrock's generated api.aws endpoint names are not live. Opt supported clients in explicitly
// instead of using AWS_USE_DUALSTACK_ENDPOINT globally.
export const AWS_DUALSTACK_CLIENT_CONFIG = { useDualstackEndpoint: true } as const
