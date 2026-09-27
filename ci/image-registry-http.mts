export type RegistryFetch = typeof fetch
export type RegistryClientOptions = {
  fetch?: RegistryFetch
  maxBodyBytes?: number
  signal?: AbortSignal
  timeoutMs?: number
}

export type RegistryBounds = { maxBodyBytes: number; timeoutMs: number }

const TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 1024 * 1024

export function resolveRegistryBounds(options: RegistryClientOptions): RegistryBounds {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > TIMEOUT_MS ||
    !Number.isSafeInteger(maxBodyBytes) ||
    maxBodyBytes <= 0 ||
    maxBodyBytes > MAX_BODY_BYTES
  )
    throw new Error('invalid GHCR registry client bounds')
  return { maxBodyBytes, timeoutMs }
}

export async function fetchRegistryResponse(
  transport: RegistryFetch,
  url: URL,
  headers: Record<string, string>,
  bounds: RegistryBounds,
  callerSignal?: AbortSignal,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(bounds.timeoutMs)
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal
  const response = await transport(url, { headers, method: 'GET', redirect: 'error', signal })
  if (response.redirected) {
    await response.body?.cancel()
    throw new Error('redirected registry response')
  }
  return response
}

export async function readRegistryBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0)
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('response body exceeds bound')
      }
      chunks.push(Buffer.from(next.value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}
