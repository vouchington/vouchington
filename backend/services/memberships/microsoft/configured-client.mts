import { getExternalFetch } from '@modules/utils'
import type {
  MicrosoftStoreClient,
  MicrosoftStoreCollectionItem,
  MicrosoftStoreRecurrence,
} from './types.mts'
import { isInvalidStoreIdKeyResponse, MicrosoftStoreResponseError } from './response-error.mts'
import { getMicrosoftStoreServiceToken } from './service-token.mts'

const COLLECTIONS_URL = 'https://collections.mp.microsoft.com/v9.0/collections/publisherQuery'
const RECURRENCES_URL = 'https://purchase.mp.microsoft.com/v8.0/b2b/recurrences/query'
const MAX_QUERY_PAGES = 10

/** Worker-only Microsoft Store client. Store ID keys stay in the request body, never a URL. */
export function createConfiguredMicrosoftStoreClient(): MicrosoftStoreClient {
  const config = getMicrosoftStoreServiceConfig()
  return {
    queryCollections(options) {
      return queryMicrosoftStoreCollections(config, options)
    },
    queryRecurrences(options) {
      return queryMicrosoftStoreRecurrences(config, options)
    },
  }
}

export type MicrosoftStoreServiceConfig = {
  tenantId: string
  clientId: string
  clientSecret: string
}

export function getMicrosoftStoreServiceConfig(): MicrosoftStoreServiceConfig {
  return {
    tenantId: requiredEnv('MICROSOFT_STORE_TENANT_ID'),
    clientId: requiredEnv('MICROSOFT_STORE_CLIENT_ID'),
    clientSecret: requiredEnv('MICROSOFT_STORE_CLIENT_SECRET'),
  }
}

async function queryMicrosoftStoreCollections(
  config: MicrosoftStoreServiceConfig,
  options: Parameters<MicrosoftStoreClient['queryCollections']>[0],
): Promise<MicrosoftStoreCollectionItem[]> {
  return queryMicrosoftStorePages<MicrosoftStoreCollectionItem>(
    config,
    COLLECTIONS_URL,
    {
      maxPageSize: 200,
      excludeDuplicates: false,
      beneficiaries: [
        {
          identityType: 'b2b',
          identityValue: options.key,
          localTicketReference: options.publisherUserId,
        },
      ],
      productSkuIds: [
        options.skuId === null
          ? { productId: options.productId }
          : { productId: options.productId, skuId: options.skuId },
      ],
      validityType: 'All',
      ...(options.environment === 'test' ? { sbx: 'XDKS.1' } : {}),
    },
    'collections',
  )
}

async function queryMicrosoftStoreRecurrences(
  config: MicrosoftStoreServiceConfig,
  options: Parameters<MicrosoftStoreClient['queryRecurrences']>[0],
): Promise<MicrosoftStoreRecurrence[]> {
  return queryMicrosoftStorePages<MicrosoftStoreRecurrence>(
    config,
    RECURRENCES_URL,
    {
      b2bKey: options.key,
      ...(options.environment === 'test' ? { sbx: 'XDKS.1' } : {}),
    },
    'recurrences',
  )
}

async function queryMicrosoftStorePages<T>(
  config: MicrosoftStoreServiceConfig,
  url: string,
  body: Record<string, unknown>,
  queryName: string,
): Promise<T[]> {
  const items: T[] = []
  const continuationTokens = new Set<string>()
  let continuationToken: string | null = null
  for (let page = 0; page < MAX_QUERY_PAGES; page++) {
    const requestBody = continuationToken === null ? body : { ...body, continuationToken }
    // eslint-disable-next-line no-await-in-loop -- each page requires the previous continuation token.
    const response = await microsoftFetch(config, url, requestBody)
    // eslint-disable-next-line no-await-in-loop -- each page response yields the next continuation token.
    const payload = await response.json()
    const parsed = parseMicrosoftStorePage<T>(payload, queryName)
    items.push(...parsed.items)
    if (parsed.continuationToken === null) return items
    if (continuationTokens.has(parsed.continuationToken))
      throw new Error(`Microsoft Store ${queryName} continuation token repeated`)
    continuationTokens.add(parsed.continuationToken)
    continuationToken = parsed.continuationToken
  }
  throw new Error(`Microsoft Store ${queryName} query exceeded ${MAX_QUERY_PAGES} pages`)
}

async function microsoftFetch(
  config: MicrosoftStoreServiceConfig,
  url: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const token = await getMicrosoftStoreServiceToken(config)
  /* no-mistakes: integration=microsoft-store */
  const response = await getExternalFetch()(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new MicrosoftStoreResponseError(
      response.status,
      isInvalidStoreIdKeyResponse(response.status, payload),
    )
  }
  return response
}

function parseMicrosoftStorePage<T>(
  payload: unknown,
  queryName: string,
): { items: T[]; continuationToken: string | null } {
  if (!isRecord(payload) || !Array.isArray(payload.items) || !payload.items.every(isRecord))
    throw new Error(`Microsoft Store ${queryName} response is malformed`)
  if (payload.continuationToken === undefined)
    return { items: payload.items as T[], continuationToken: null }
  if (typeof payload.continuationToken !== 'string' || !payload.continuationToken.trim())
    throw new Error(`Microsoft Store ${queryName} response is malformed`)
  return { items: payload.items as T[], continuationToken: payload.continuationToken }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Microsoft Store membership verification`)
  return value
}
