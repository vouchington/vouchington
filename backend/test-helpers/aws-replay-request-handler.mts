import { Readable } from 'node:stream'
import type { ProviderReplay } from './provider-replay.mts'

// Serves a recorded response through an AWS SDK v3 client's `requestHandler`, so the SDK still
// serializes, signs, parses and classifies errors itself and nothing touches the network. The
// handler forwards each request to the replay's `fetch`, which captures it and answers with the
// next queued response. See docs/development/testing/backend/helpers.md.

/** The parts of smithy's `HttpRequest` this handler reads. */
type AwsReplayHttpRequest = {
  method: string
  protocol: string
  hostname: string
  port?: number
  path: string
  query?: Record<string, string | string[] | null>
  headers: Record<string, string>
  body?: string | Uint8Array
}

type AwsReplayHandlerOptions = { abortSignal?: unknown }

/** Smithy treats any object with a `handle` function as an `HttpHandler`. */
export type AwsReplayRequestHandler = {
  handle: (
    request: AwsReplayHttpRequest,
    options?: AwsReplayHandlerOptions,
  ) => Promise<{
    response: {
      statusCode: number
      reason: string
      headers: Record<string, string>
      body: Readable
    }
  }>
  destroy: () => void
  updateHttpClientConfig: () => void
  httpHandlerConfigs: () => Record<string, never>
}

export function createAwsReplayRequestHandler(replay: ProviderReplay): AwsReplayRequestHandler {
  return {
    async handle(request, options) {
      const url = new URL(`${request.protocol}//${request.hostname}${request.path}`)
      if (request.port) url.port = String(request.port)
      for (const [name, value] of Object.entries(request.query ?? {})) {
        for (const part of [value ?? []].flat()) url.searchParams.append(name, part)
      }
      const response = await replay.fetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: options?.abortSignal instanceof AbortSignal ? options.abortSignal : undefined,
      })
      return {
        response: {
          statusCode: response.status,
          reason: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: Readable.from([Buffer.from(await response.arrayBuffer())]),
        },
      }
    },
    destroy: () => {},
    updateHttpClientConfig: () => {},
    httpHandlerConfigs: () => ({}),
  }
}

/**
 * Subclasses an AWS SDK client so every instance sends through the replay, whatever
 * `requestHandler` production code configured. Use it inside a `vi.mock` of the SDK package for a
 * client that production builds itself, so the test never edits production code.
 */
export function replayAwsClient<Client extends abstract new (config: never) => object>(
  Constructor: Client,
  replay: ProviderReplay,
): Client {
  const Base = Constructor as unknown as new (options?: object) => object
  const requestHandler = createAwsReplayRequestHandler(replay)
  class ReplayAwsClient extends Base {
    constructor(options?: object) {
      super({ ...options, requestHandler })
    }
  }
  return ReplayAwsClient as unknown as Client
}
