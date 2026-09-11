// Rewrites the Workers Cache placeholder nonce (see types.mts's
// CACHE_PLACEHOLDER_NONCE doc comment) back to a fresh, real per-request nonce
// on the way out of the gateway. CachedOrigin stamps every cacheable web HTML
// response with the placeholder — instead of a real nonce — so the *same*
// cached bytes are valid for every client that later hits it; each client's
// own request gets its own real nonce substituted in at read time here.
//
// Only the HTML body needs rewriting. The `content-security-policy` response
// header is NOT rewritten here: the gateway's addSecurityHeaders() call in
// index.mts unconditionally overwrites that header with a freshly built value
// (using the real per-request nonce) regardless of dispatch path, so by the
// time this module would see it, it's already correct.
//
// Strips these meta tags from the rewritten HTML. They carry the *origin's* (CachedOrigin's)
// trace context, which is meaningless — and potentially confusing/leaky — once replayed to a
// different client via the platform cache. web/app/layout.tsx's generateMetadata() now suppresses
// these tags at render time on a cache-fill request so they never enter the cache in the first
// place; this strip stays as a deploy-overlap safety net for the window where the Worker has
// shipped this change but web hasn't yet (old web still emits the tags unconditionally, on every
// render) — see docs/overview/architecture/anon-html-edge-caching-csp.md. Remove in a fast-follow
// once both cloudflare-worker and web are confirmed live with the new code.
const SENTRY_META_TAG_RE = /^<meta\s+name="(?:sentry-trace|baggage)"[^>]*>$/i
const MAX_SENTRY_META_TAG_BYTES = 16 * 1024
const OUTPUT_BATCH_CHARS = 16 * 1024

/**
 * Rewrite the placeholder nonce without accumulating HTML in the Worker. A
 * bounded tail makes replacements correct when either a nonce or a Sentry meta
 * tag crosses a stream chunk boundary. A malformed meta tag longer than the
 * tail is passed through rather than retained without bound; it cannot expose
 * the nonce because nonce matching has its own exact bounded tail.
 */
export async function rewritePlaceholderNonce(
  response: Response,
  placeholderNonce: string,
  realNonce: string,
): Promise<Response> {
  if (!response.body || !placeholderNonce || placeholderNonce === realNonce) return response
  const headers = new Headers(response.headers)
  // A byte transform cannot retain the original wire length. The body we emit
  // is decoded HTML, so neither header describes it after a rewrite.
  headers.delete('content-encoding')
  headers.delete('content-length')
  return new Response(
    response.body.pipeThrough(createNonceRewriteStream(placeholderNonce, realNonce)),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    },
  )
}

function createNonceRewriteStream(placeholderNonce: string, realNonce: string) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let outputController: TransformStreamDefaultController<Uint8Array> | undefined
  let nonceCandidate = ''
  let sentryCandidate = ''
  let outputBuffer = ''

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      outputController = controller
      appendNonceRewritten(decoder.decode(chunk, { stream: true }))
    },
    flush(controller) {
      outputController = controller
      appendNonceRewritten(decoder.decode())
      appendSentryFiltered(nonceCandidate)
      nonceCandidate = ''
      appendOutput(sentryCandidate)
      sentryCandidate = ''
      flushOutput()
    },
  })

  function appendOutput(output: string) {
    outputBuffer += output
    if (outputBuffer.length >= OUTPUT_BATCH_CHARS) flushOutput()
  }

  function flushOutput() {
    if (!outputBuffer) return
    outputController?.enqueue(encoder.encode(outputBuffer))
    outputBuffer = ''
  }

  function appendNonceRewritten(text: string) {
    for (const char of text) {
      const candidate = nonceCandidate + char
      if (candidate === placeholderNonce) {
        appendSentryFiltered(realNonce)
        nonceCandidate = ''
        continue
      }
      const prefixLength = longestPlaceholderPrefix(candidate)
      appendSentryFiltered(candidate.slice(0, candidate.length - prefixLength))
      nonceCandidate = candidate.slice(candidate.length - prefixLength)
    }
  }

  function longestPlaceholderPrefix(value: string): number {
    const max = Math.min(value.length, placeholderNonce.length - 1)
    for (let length = max; length > 0; length -= 1) {
      if (value.endsWith(placeholderNonce.slice(0, length))) return length
    }
    return 0
  }

  function appendSentryFiltered(text: string) {
    for (const char of text) {
      if (!sentryCandidate) {
        if (char === '<') sentryCandidate = char
        else appendOutput(char)
        continue
      }
      sentryCandidate += char
      const lower = sentryCandidate.toLowerCase()
      if ('<meta'.startsWith(lower)) continue
      if (!lower.startsWith('<meta')) {
        appendOutput(sentryCandidate)
        sentryCandidate = ''
        continue
      }
      if (sentryCandidate.length > MAX_SENTRY_META_TAG_BYTES) {
        appendOutput(sentryCandidate)
        sentryCandidate = ''
        continue
      }
      if (char !== '>') continue
      if (!SENTRY_META_TAG_RE.test(sentryCandidate)) appendOutput(sentryCandidate)
      sentryCandidate = ''
    }
  }
}
