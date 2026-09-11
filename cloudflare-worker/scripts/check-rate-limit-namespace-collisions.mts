interface CloudflareEnvelope<T> {
  success: boolean
  result: T
  errors?: unknown[]
  result_info?: { page?: number; total_pages?: number }
}

interface WorkerScript {
  id: string
}

interface WorkerBinding {
  type?: string
  namespace_id?: string
}

const API_ROOT = 'https://api.cloudflare.com/client/v4'

const RESPONSE_BODY_SNIPPET_LIMIT = 500

async function throwCloudflareResponseError(response: Response, reason: string): Promise<never> {
  const body = (await response.text()).slice(0, RESPONSE_BODY_SNIPPET_LIMIT)
  throw new Error(`Cloudflare API ${reason} (${response.status}): ${body}`)
}

async function readCloudflareEnvelope<T>(response: Response): Promise<CloudflareEnvelope<T>> {
  // Check status and content-type before parsing: an upstream error (a WAF block, a 502 from
  // Cloudflare's edge, or any non-JSON body) must surface the real HTTP status and body, not a
  // bare `SyntaxError` from `.json()` that discards both.
  if (!response.ok) return throwCloudflareResponseError(response, 'request failed')
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return throwCloudflareResponseError(response, 'returned a non-JSON response')
  }
  const envelope = (await response.json()) as CloudflareEnvelope<T>
  if (!envelope.success) {
    throw new Error(
      `Cloudflare API request failed (${response.status}): ${JSON.stringify(envelope.errors ?? [])}`,
    )
  }
  return envelope
}

async function readCloudflareResult<T>(response: Response): Promise<T> {
  return (await readCloudflareEnvelope<T>(response)).result
}

async function listWorkerScripts(
  accountId: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<WorkerScript[]> {
  const scripts: WorkerScript[] = []
  let page = 1
  let totalPages = 1
  do {
    const url = `${API_ROOT}/accounts/${accountId}/workers/scripts?page=${page}&per_page=100`
    // eslint-disable-next-line no-await-in-loop -- each response supplies the total-page bound required before requesting the next page
    const envelope = await readCloudflareEnvelope<WorkerScript[]>(await fetchImpl(url, { headers }))
    scripts.push(...envelope.result)
    totalPages = envelope.result_info?.total_pages ?? page
    page += 1
  } while (page <= totalPages)
  return scripts
}

export async function findRateLimitNamespaceCollisions(
  accountId: string,
  apiToken: string,
  targetScript: string,
  desiredNamespaceIds: ReadonlySet<string>,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ script: string; namespaceId: string }>> {
  const headers = { authorization: `Bearer ${apiToken}` }
  const scripts = await listWorkerScripts(accountId, headers, fetchImpl)
  const settingsByScript = await Promise.all(
    scripts
      .filter(script => script.id !== targetScript)
      .map(async script => ({
        script: script.id,
        settings: await readCloudflareResult<{ bindings?: WorkerBinding[] }>(
          await fetchImpl(
            `${API_ROOT}/accounts/${accountId}/workers/scripts/${script.id}/settings`,
            { headers },
          ),
        ),
      })),
  )

  return settingsByScript.flatMap(({ script, settings }) =>
    (settings.bindings ?? []).flatMap(binding =>
      binding.type === 'ratelimit' &&
      binding.namespace_id &&
      desiredNamespaceIds.has(binding.namespace_id)
        ? [{ script, namespaceId: binding.namespace_id }]
        : [],
    ),
  )
}

export interface RateLimitNamespaceCollisionCliOptions {
  args: readonly string[]
  check: typeof findRateLimitNamespaceCollisions
  env: Readonly<Record<string, string | undefined>>
  isMain: boolean
  log: (message: string) => void
}

export async function runRateLimitNamespaceCollisionCli(
  options: RateLimitNamespaceCollisionCliOptions,
): Promise<void> {
  if (!options.isMain) return
  const accountId = options.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = options.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) throw new Error('Cloudflare account credentials are required')
  const desired = new Set(options.args)
  if (desired.size === 0) throw new Error('At least one namespace ID is required')
  const collisions = await options.check(
    accountId,
    apiToken,
    'voucha-cloudflare-worker-staging',
    desired,
  )
  if (collisions.length > 0) {
    throw new Error(`Rate-limit namespace collision: ${JSON.stringify(collisions)}`)
  }
  options.log(`Verified ${desired.size} rate-limit namespace IDs are unused by other Workers`)
}

await runRateLimitNamespaceCollisionCli({
  args: process.argv.slice(2),
  check: findRateLimitNamespaceCollisions,
  env: process.env,
  isMain: import.meta.main,
  log: console.log,
})
