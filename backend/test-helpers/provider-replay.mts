import { readFileSync } from 'node:fs'
import type { getExternalFetch } from '@modules/utils'

/**
 * Replays a recorded provider HTTP response through the provider SDK's own transport hook, so the
 * SDK parses real wire bytes (status line, headers, SSE or JSON body) and no network is touched.
 * Fixtures are `curl -si`-style files under `provider-fixtures/<provider>/`; see
 * docs/development/testing/backend/helpers.md#recorded-provider-responses.
 */

/** A provider response as it arrived on the wire: status, headers and the raw body bytes. */
export type RecordedResponse = {
  status: number
  statusText: string
  headers: Array<[name: string, value: string]>
  body: Buffer
}

/** What the code under test sent. Header names are lower-cased. */
export type ReplayedRequest = {
  method: string
  url: string
  headers: Record<string, string>
  body: Buffer | undefined
  json: <T = unknown>() => T
}

export type ProviderReplay = {
  /** Pass this as the SDK's `fetch` option. It answers each request with the next queued response. */
  fetch: ReturnType<typeof getExternalFetch>
  /** Every request the SDK sent, in order. */
  requests: ReplayedRequest[]
  /** Queue responses; the SDK receives them in request order. */
  respondWith: (...responses: RecordedResponse[]) => void
  /** Fail when a queued response was never requested, so a skipped call cannot pass silently. */
  assertDrained: () => void
  /** Forget the queue and the captured requests, for a client shared across the tests of a file. */
  reset: () => void
}

/** Headers describing the original transfer framing; the replay serves the decoded body instead. */
const FRAMING_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding',
])
const FIXTURE_ROOT = new URL('./provider-fixtures/', import.meta.url)

/**
 * Loads `provider-fixtures/<name>`. `replace` swaps literal tokens in the whole file, for the ids a
 * test must keep unique on the shared database (a fixed provider id would collide between runs).
 */
export function loadRecordedResponse(
  name: string,
  options: { replace?: Record<string, string> } = {},
): RecordedResponse {
  let raw = readFileSync(new URL(name, FIXTURE_ROOT)).toString('latin1')
  for (const [token, value] of Object.entries(options.replace ?? {})) {
    raw = raw.replaceAll(token, value)
  }
  return parseRecordedResponse(Buffer.from(raw, 'latin1'))
}

/** Parses raw HTTP response text: a status line, headers, a blank line, then the body bytes. */
export function parseRecordedResponse(raw: Buffer): RecordedResponse {
  const crlf = raw.indexOf('\r\n\r\n')
  const lf = raw.indexOf('\n\n')
  const useCrlf = crlf !== -1 && (lf === -1 || crlf < lf)
  const headEnd = useCrlf ? crlf : lf
  const head = headEnd === -1 ? raw : raw.subarray(0, headEnd)
  const body = headEnd === -1 ? Buffer.alloc(0) : raw.subarray(headEnd + (useCrlf ? 4 : 2))
  const [statusLine = '', ...headerLines] = head.toString('latin1').split(/\r?\n/)
  const status = /^HTTP\/\S+ (\d{3})(?: (.*))?$/.exec(statusLine)
  if (!status) throw new Error(`Recorded response has no HTTP status line: ${statusLine}`)
  const headers = headerLines.flatMap((line): Array<[string, string]> => {
    const colon = line.indexOf(':')
    const name = line.slice(0, colon).trim().toLowerCase()
    if (colon < 1 || FRAMING_HEADERS.has(name)) return []
    return [[name, line.slice(colon + 1).trim()]]
  })
  return { status: Number(status[1]), statusText: status[2] ?? '', headers, body }
}

/**
 * Builds the `Response` an SDK reads. The body streams in `chunkBytes` pieces (default: one), so a
 * small value proves the consumer does not depend on events arriving aligned to chunk boundaries.
 */
export function toReplayResponse(recorded: RecordedResponse, chunkBytes?: number): Response {
  const size = chunkBytes ?? Math.max(recorded.body.length, 1)
  let offset = 0
  const body =
    recorded.body.length === 0
      ? null
      : new ReadableStream<Uint8Array>({
          pull(controller) {
            if (offset >= recorded.body.length) return controller.close()
            controller.enqueue(recorded.body.subarray(offset, offset + size))
            offset += size
          },
        })
  return new Response(body, {
    status: recorded.status,
    statusText: recorded.statusText,
    headers: recorded.headers,
  })
}

export function createProviderReplay(options: { chunkBytes?: number } = {}): ProviderReplay {
  const requests: ReplayedRequest[] = []
  const queue: RecordedResponse[] = []

  const replayFetch: ProviderReplay['fetch'] = async (input, init) => {
    init?.signal?.throwIfAborted()
    const request = input instanceof Request ? input : undefined
    const body = await readBody(
      init?.body ?? (request ? await request.clone().arrayBuffer() : null),
    )
    const sent: ReplayedRequest = {
      method: init?.method ?? request?.method ?? 'GET',
      url: input instanceof Request ? input.url : String(input),
      headers: Object.fromEntries(new Headers(init?.headers ?? request?.headers).entries()),
      body,
      json: <T,>() => JSON.parse(body?.toString('utf8') ?? 'null') as T,
    }
    requests.push(sent)
    const next = queue.shift()
    if (!next) {
      throw new Error(
        `Provider replay has no recorded response for request ${requests.length}: ${sent.method} ${sent.url}`,
      )
    }
    return toReplayResponse(next, options.chunkBytes)
  }

  return {
    fetch: replayFetch,
    requests,
    respondWith: (...responses) => void queue.push(...responses),
    assertDrained: () => {
      if (queue.length > 0) {
        throw new Error(`Provider replay left ${queue.length} recorded response(s) unrequested`)
      }
    },
    reset: () => {
      requests.length = 0
      queue.length = 0
    },
  }
}

/**
 * Subclasses an SDK client so every instance sends through the replay, whatever `fetch` production
 * code configured. Use it inside a `vi.mock` of the SDK package for a client that production builds
 * itself, so the test never edits production code.
 */
export function replayClient<Client extends abstract new (...args: never[]) => object>(
  Constructor: Client,
  replay: ProviderReplay,
): Client {
  const Base = Constructor as unknown as new (options?: object) => object
  class ReplayClient extends Base {
    constructor(options?: object) {
      super({ ...options, fetch: replay.fetch })
    }
  }
  return ReplayClient as unknown as Client
}

async function readBody(body: unknown): Promise<Buffer | undefined> {
  if (body == null) return undefined
  const bytes = Buffer.from(
    await new Response(body as ConstructorParameters<typeof Response>[0]).arrayBuffer(),
  )
  return bytes.length === 0 ? undefined : bytes
}
