// Route tests assert with supertest's `.expect(status)`, whose failure message drops the response
// body, and `onError` stays silent under NODE_ENV=test — so an unexpected 500 fails with no server
// message or stack. `createRequest()` records every 5xx here, and
// `vitest.setup.server-error-responses.mts` prints them only when the running test fails.

export type RecordedServerErrorResponse = {
  method: string
  url: string
  status: number
  body: unknown
}

type RecordedRequest = { method: string; url: string }
type RecordedResponse = { status: number; body: unknown; text?: string }

// Bounded so projects that use createRequest() without the draining setup file cannot grow it.
export const MAX_RECORDED_SERVER_ERROR_RESPONSES = 20
const STATE_KEY = '__vouchaApiTestServerErrorResponses'

type ServerErrorResponsesGlobal = typeof globalThis & {
  [STATE_KEY]?: RecordedServerErrorResponse[]
}

export function recordServerErrorResponse(
  request: RecordedRequest,
  response: RecordedResponse,
): void {
  if (response.status < 500) return
  const recorded = recordedResponses()
  recorded.push({
    method: request.method,
    url: request.url,
    status: response.status,
    body: hasParsedBody(response.body) ? response.body : response.text,
  })
  recorded.splice(0, Math.max(0, recorded.length - MAX_RECORDED_SERVER_ERROR_RESPONSES))
}

export function takeRecordedServerErrorResponses(): RecordedServerErrorResponse[] {
  return recordedResponses().splice(0)
}

export function formatRecordedServerErrorResponses(
  responses: readonly RecordedServerErrorResponse[],
): string {
  const sections = responses.map(
    ({ method, url, status, body }) => `${method} ${url} -> ${status}\n${formatBody(body)}`,
  )
  return ['Server error responses during this test:', ...sections].join('\n\n')
}

// State lives on globalThis: `vi.resetModules()` re-evaluates this module for server.mts while the
// setup file keeps its original instance, and both must drain the same buffer.
function recordedResponses(): RecordedServerErrorResponse[] {
  const state = globalThis as ServerErrorResponsesGlobal
  state[STATE_KEY] ??= []
  return state[STATE_KEY]
}

function hasParsedBody(body: unknown): boolean {
  return typeof body === 'object' && body !== null && Object.keys(body).length > 0
}

function formatBody(body: unknown): string {
  if (typeof body !== 'object' || body === null) return body ? String(body) : '(empty body)'
  const { stack, ...fields } = body as Record<string, unknown>
  const json = JSON.stringify(fields, null, 2)
  return typeof stack === 'string' ? `${json}\n${stack}` : json
}
