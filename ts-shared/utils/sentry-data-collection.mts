// Sentry v11 defaults `dataCollection` to capturing every HTTP body and every gen-AI input and
// output (`@sentry/core` resolveDataCollectionOptions). Bodies carry legal identities, perjury
// statements and other form data; gen-AI inputs carry the same content as LLM prompts, and MCP
// tool arguments and results. Every SDK init site passes this policy so none of it leaves the app.
// Headers, cookies and query strings stay collected and go through the credential scrubbers.

export interface SentryDataCollectionPolicy {
  httpBodies: never[]
  genAI: { inputs: false; outputs: false }
}

// Returns a fresh object per init: the SDK keeps the `httpBodies` array it is given.
export function createSentryDataCollection(): SentryDataCollectionPolicy {
  return { httpBodies: [], genAI: { inputs: false, outputs: false } }
}

// `httpBodies` gates only the write: `requestdata` still copies body data that something else put
// on the scope. These backstops drop it from spans and from the event Request Interface.
const REQUEST_BODY_SPAN_ATTRIBUTE = 'http.request.body.data'

export function dropSpanRequestBody<TData extends Record<string, unknown>>(data: TData): TData {
  if (!Object.hasOwn(data, REQUEST_BODY_SPAN_ATTRIBUTE)) return data
  return omitOwnKey(data, REQUEST_BODY_SPAN_ATTRIBUTE)
}

export function dropRequestBody<TRequest extends object>(
  request: TRequest | undefined,
): TRequest | undefined {
  if (!request || !Object.hasOwn(request, 'data')) return request
  return omitOwnKey(request, 'data')
}

function omitOwnKey<T extends object>(value: T, omitted: string): T {
  const entries = Object.entries(value).filter(([key]) => key !== omitted)
  return Object.fromEntries(entries) as T
}
