import assert from 'http-assert'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import { getSiteUrl } from '@modules/utils'
import { optOutCrmContactByEmail } from './opt-out.mts'

const UNSUBSCRIBE_PURPOSE = 'crm-unsubscribe-token'

type CrmUnsubscribeTokenPayload = {
  email: string
}

export function createCrmUnsubscribeToken(email: string): string {
  return encryptSecret(JSON.stringify({ email }), UNSUBSCRIBE_PURPOSE)
}

export function createCrmUnsubscribeUrl(email: string): string {
  const token = createCrmUnsubscribeToken(email)
  return getSiteUrl(`/crm/unsubscribe?token=${encodeURIComponent(token)}`)
}

export function createCrmListUnsubscribeHeaders(email: string): Record<string, string> {
  const token = createCrmUnsubscribeToken(email)
  return {
    'List-Unsubscribe': `<${getSiteUrl(
      `/api/v1/crm/unsubscribe?token=${encodeURIComponent(token)}`,
    )}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

export async function unsubscribeCrmContactByToken(token: string): Promise<void> {
  const payload = parseCrmUnsubscribeToken(token)
  await optOutCrmContactByEmail(payload.email)
}

function parseCrmUnsubscribeToken(token: string): CrmUnsubscribeTokenPayload {
  assert(typeof token === 'string' && token.length > 0, 400, 'Unsubscribe token is required')
  let payload: unknown
  try {
    payload = JSON.parse(decryptSecret(token, UNSUBSCRIBE_PURPOSE))
  } catch {
    assert(false, 400, 'Invalid unsubscribe token')
  }
  assert(isCrmUnsubscribeTokenPayload(payload), 400, 'Invalid unsubscribe token')
  return payload
}

function isCrmUnsubscribeTokenPayload(value: unknown): value is CrmUnsubscribeTokenPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<CrmUnsubscribeTokenPayload>
  return typeof payload.email === 'string' && payload.email.length > 0
}
