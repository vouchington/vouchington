import { vi } from 'vitest'
import * as httpDispatchers from '../modules/utils/http.mts'
import { processMicrosoftStoreMembershipVerification } from '../services/memberships/microsoft/process-verification.mts'
import { MicrosoftStoreResponseError } from '../services/memberships/microsoft/response-error.mts'
import type { MicrosoftStoreClient } from '../services/memberships/microsoft/types.mts'

const COLLECTIONS_URL = 'https://collections.mp.microsoft.com/v9.0/collections/publisherQuery'
const RECURRENCES_URL = 'https://purchase.mp.microsoft.com/v8.0/b2b/recurrences/query'
const TOKEN_URL_PREFIX = 'https://login.microsoftonline.com/'

type CollectionsBody = {
  beneficiaries: { identityValue: string; localTicketReference: string }[]
  productSkuIds: { productId: string; skuId?: string }[]
  sbx?: string
}
type RecurrencesBody = { b2bKey: string; sbx?: string }

/**
 * Serves the Microsoft Store token, Collections and Recurrence endpoints at the external-fetch
 * boundary, so the production client builds and parses every request. A MicrosoftStoreResponseError
 * thrown by an answer is returned as that HTTP status; any other error rejects the fetch.
 * Callers restore mocks and env after each test.
 */
export function stubMicrosoftStoreProvider(answers: MicrosoftStoreClient): void {
  vi.stubEnv('MICROSOFT_STORE_TENANT_ID', 'microsoft-store-test-tenant')
  vi.stubEnv('MICROSOFT_STORE_CLIENT_SECRET', 'microsoft-store-test-secret')
  const providerFetch: ReturnType<typeof httpDispatchers.getExternalFetch> = async (
    input,
    init,
  ) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(TOKEN_URL_PREFIX))
      return Response.json({ access_token: 'microsoft-store-test-token', expires_in: 3600 })
    const body: unknown = JSON.parse(String(init?.body))
    try {
      if (url === COLLECTIONS_URL)
        return Response.json({ items: await collections(answers, body as CollectionsBody) })
      if (url === RECURRENCES_URL)
        return Response.json({ items: await recurrences(answers, body as RecurrencesBody) })
    } catch (err) {
      if (!(err instanceof MicrosoftStoreResponseError)) throw err
      return Response.json(err.invalidStoreIdKey ? { error: { code: 'InvalidStoreIdKey' } } : {}, {
        status: err.status,
      })
    }
    throw new Error(`Unexpected Microsoft Store provider URL ${url}`)
  }
  vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(providerFetch)
}

function collections(answers: MicrosoftStoreClient, request: CollectionsBody) {
  const sku = request.productSkuIds[0]!
  const beneficiary = request.beneficiaries[0]!
  return answers.queryCollections({
    key: beneficiary.identityValue,
    publisherUserId: beneficiary.localTicketReference,
    productId: sku.productId,
    skuId: sku.skuId ?? null,
    environment: request.sbx === undefined ? 'production' : 'test',
  })
}

function recurrences(answers: MicrosoftStoreClient, request: RecurrencesBody) {
  return answers.queryRecurrences({
    key: request.b2bKey,
    environment: request.sbx === undefined ? 'production' : 'test',
  })
}

/** Runs the production verification worker against a stubbed Microsoft Store. */
export async function processMicrosoftStoreVerificationAgainst(
  verificationId: string,
  answers: MicrosoftStoreClient,
): Promise<void> {
  stubMicrosoftStoreProvider(answers)
  await processMicrosoftStoreMembershipVerification(verificationId)
}
