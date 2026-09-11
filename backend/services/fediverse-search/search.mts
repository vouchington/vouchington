import assert from 'http-assert'
import type {
  FediverseProviderAdapter,
  FediverseSearchBucket,
  FediverseSearchOptions,
  FediverseSearchProvider,
  FediverseSearchResponse,
  FediverseSearchResultType,
} from './types.mts'
import { FEDIVERSE_SEARCH_DEADLINE_MS } from '@voucha/config'

const DEFAULT_PROVIDERS: readonly FediverseSearchProvider[] = [
  'peertube',
  'mastodon',
  'lemmy',
  'bluesky',
]
const FEDIVERSE_SEARCH_DEFAULT_LIMIT = 10
const FEDIVERSE_SEARCH_MAX_LIMIT = 25

const EMPTY_ADAPTERS: Record<FediverseSearchProvider, FediverseProviderAdapter> = {
  peertube: emptyAdapter('peertube'),
  mastodon: emptyAdapter('mastodon'),
  lemmy: emptyAdapter('lemmy'),
  bluesky: emptyAdapter('bluesky'),
}

export function parseFediverseProviders(value: unknown): FediverseSearchProvider[] | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const providers = String(value)
    .split(',')
    .flatMap(provider => {
      const trimmed = provider.trim()
      return trimmed ? [trimmed] : []
    })

  assert(providers.length > 0, 400, 'At least one Fediverse provider is required')
  for (const provider of providers) {
    assert(isFediverseProvider(provider), 400, `Unsupported Fediverse provider: ${provider}`)
  }
  return [...new Set(providers)] as FediverseSearchProvider[]
}

export function parseFediverseResultType(value: unknown): FediverseSearchResultType | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const type = String(value)
  assert(isFediverseResultType(type), 400, `Unsupported Fediverse result type: ${type}`)
  return type
}

export async function searchFediverse(
  options: FediverseSearchOptions,
  adapters: Partial<Record<FediverseSearchProvider, FediverseProviderAdapter>> = EMPTY_ADAPTERS,
): Promise<FediverseSearchResponse> {
  const q = options.q.trim()
  if (q.length < 2) {
    return { buckets: [] }
  }

  const rawLimit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? options.limit
      : FEDIVERSE_SEARCH_DEFAULT_LIMIT
  const limit = Math.min(Math.max(1, Math.trunc(rawLimit)), FEDIVERSE_SEARCH_MAX_LIMIT)
  const providers = selectFediverseSearchProviders(options)
  // Cursors are provider-specific; forwarding one incoming cursor to multiple providers would
  // replay an unrelated provider's pagination token. Only a single-provider request can resume.
  const forwardCursor = providers.length === 1

  const buckets = await Promise.all(
    providers.map(provider =>
      searchProvider(
        provider,
        {
          ...options,
          q,
          limit,
          providers: [provider],
          cursor: forwardCursor ? options.cursor : undefined,
        },
        adapters[provider] ?? EMPTY_ADAPTERS[provider],
      ),
    ),
  )

  return { buckets }
}

export function buildUnavailableFediverseSearchResponse(
  options: FediverseSearchOptions,
): FediverseSearchResponse {
  if (options.q.trim().length < 2) return { buckets: [] }
  return {
    buckets: selectFediverseSearchProviders(options).map(provider => ({
      provider,
      status: 'error',
      items: [],
      error_code: 'provider_error',
    })),
  }
}

function selectFediverseSearchProviders(
  options: FediverseSearchOptions,
): FediverseSearchProvider[] {
  return options.providers?.length ? options.providers : [...DEFAULT_PROVIDERS]
}

async function searchProvider(
  provider: FediverseSearchProvider,
  options: FediverseSearchOptions,
  adapter: FediverseProviderAdapter,
): Promise<FediverseSearchBucket> {
  try {
    const bucket = await withDeadline(provider, adapter.search(options))
    return {
      provider,
      status: bucket.status,
      items: bucket.items.slice(0, options.limit),
      ...(bucket.next_cursor === undefined ? {} : { next_cursor: bucket.next_cursor }),
      ...(bucket.error_code === undefined ? {} : { error_code: bucket.error_code }),
    }
  } catch {
    return {
      provider,
      status: 'error',
      items: [],
      error_code: 'provider_error',
    }
  }
}

// Per-provider fetches already carry their own ~4s timeout; this is a defense-in-depth cap so a
// single slow adapter (cache round trip, retry, GC pause) can't stretch the whole response past
// the overall search deadline. Adapters unaffected by the deadline resolve normally in the race.
function withDeadline(
  provider: FediverseSearchProvider,
  promise: Promise<FediverseSearchBucket>,
): Promise<FediverseSearchBucket> {
  let clearDeadline = () => {}
  const deadline = new Promise<FediverseSearchBucket>(resolve => {
    const timer = setTimeout(
      () => resolve({ provider, status: 'error', items: [], error_code: 'provider_error' }),
      FEDIVERSE_SEARCH_DEADLINE_MS,
    )
    timer.unref()
    clearDeadline = () => clearTimeout(timer)
  })
  return Promise.race([promise, deadline]).finally(() => clearDeadline())
}

function emptyAdapter(provider: FediverseSearchProvider): FediverseProviderAdapter {
  return {
    provider,
    async search() {
      return {
        provider,
        status: 'ok',
        items: [],
      }
    },
  }
}

function isFediverseProvider(value: string): value is FediverseSearchProvider {
  return value === 'peertube' || value === 'mastodon' || value === 'lemmy' || value === 'bluesky'
}

function isFediverseResultType(value: string): value is FediverseSearchResultType {
  return value === 'video' || value === 'post' || value === 'profile' || value === 'instance'
}
