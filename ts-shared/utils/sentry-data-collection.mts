// Sentry v11 defaults `dataCollection` to collecting everything: the client IP, cookies, query
// strings, every HTTP body, bound database values, stack-frame local variables and every gen-AI
// input and output (`@sentry/core` resolveDataCollectionOptions). Bodies carry legal identities,
// perjury statements and other form data; gen-AI inputs carry the same content as LLM prompts and
// MCP tool arguments. Every SDK init site passes this policy so the least data leaves the app.
//
// - `userInfo: false` stops `user.ip_address`, `client.address` and the span-ingest IP inference.
// - `httpHeaders.request.deny` also drops the proxy headers that carry the client IP: the SDK
//   copies raw request headers onto spans whatever `userInfo` says. It matches by substring.
// - `cookies: false` drops the Cookie and Set-Cookie headers and the parsed cookies.
// - `urlQueryParams: false` drops query strings from URLs and `url.query` attributes.
// - `databaseQueryData`, `stackFrameVariables`, `queues` and `graphQL` are `false` fail-closed: no
//   integration this app registers reads them today, but each would attach bound values, local
//   variables, queue task arguments or GraphQL documents and variables, which can hold user input.
// The credential scrubbers in `sentry-event-scrubbing.mts` stay as defense in depth.

// The SDK's own client-IP header list (`@sentry/core` getIpAddress), plus Cloudflare's pseudo-IPv4.
const CLIENT_IP_HEADER_NAMES = [
  'x-client-ip',
  'x-forwarded-for',
  'x-forwarded',
  'forwarded-for',
  'forwarded',
  'x-vercel-forwarded-for',
  'x-real-ip',
  'x-cluster-client-ip',
  'true-client-ip',
  'fastly-client-ip',
  'fly-client-ip',
  'cf-connecting-ip',
  'cf-pseudo-ipv4',
]

export interface SentryDataCollectionPolicy {
  userInfo: false
  cookies: false
  httpHeaders: { request: { deny: string[] } }
  httpBodies: never[]
  urlQueryParams: false
  databaseQueryData: false
  stackFrameVariables: false
  queues: false
  graphQL: { document: false; variables: false }
  genAI: { inputs: false; outputs: false }
}

// Returns a fresh object per init: the SDK keeps the arrays it is given.
export function createSentryDataCollection(): SentryDataCollectionPolicy {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { deny: [...CLIENT_IP_HEADER_NAMES] } },
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
    queues: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
  }
}
