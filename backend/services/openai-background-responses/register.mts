import { randomUUID } from 'node:crypto'
import { beginBoundedTransaction, write, type QueryExecutor } from '@data-stores/psql'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import {
  BACKGROUND_RESPONSE_LEASE_DURATION_MS,
  createBackgroundResponseLeaseController,
  type OwnedBackgroundResponseLease,
} from './lease-controller.mts'

export interface BackgroundResponseRegistration {
  responseId: string
  agentSlug: string
  communityId?: string | null
  postId?: string | null
}

export interface RegisteredBackgroundResponseLease {
  responseId: string
  leaseToken: string
  leaseExpiresAt: Date
  createdAt: Date
}

const REGISTRATION_CONNECTION_TIMEOUT_MS = 5_000
const REGISTRATION_STATEMENT_TIMEOUT_MS = 5_000

type RegisterLease = (
  registration: BackgroundResponseRegistration,
  leaseToken: string,
) => Promise<RegisteredBackgroundResponseLease | null>

export async function registerBackgroundResponseLease(
  { responseId, agentSlug, communityId, postId }: BackgroundResponseRegistration,
  leaseToken: string,
  query: QueryExecutor = write,
): Promise<RegisteredBackgroundResponseLease | null> {
  const { rows } = await query<{
    response_id: string
    lease_token: string
    lease_expires_at: Date
    created_at: Date
  }>(sql`/* registerBackgroundResponseLease */
    INSERT INTO openai_background_responses (
      response_id, agent_slug, community_id, post_id, lease_token, lease_expires_at
    )
    VALUES (
      ${responseId}, ${agentSlug}, ${communityId ?? null}, ${postId ?? null}, ${leaseToken},
      CURRENT_TIMESTAMP + (${BACKGROUND_RESPONSE_LEASE_DURATION_MS} * INTERVAL '1 millisecond')
    )
    ON CONFLICT (response_id) DO UPDATE
    SET lease_expires_at =
      CURRENT_TIMESTAMP + (${BACKGROUND_RESPONSE_LEASE_DURATION_MS} * INTERVAL '1 millisecond')
    WHERE openai_background_responses.lease_token = EXCLUDED.lease_token
    RETURNING response_id, lease_token, lease_expires_at, created_at
  `)
  const row = rows[0]
  return row
    ? {
        responseId: row.response_id,
        leaseToken: row.lease_token,
        leaseExpiresAt: row.lease_expires_at,
        createdAt: row.created_at,
      }
    : null
}

export async function renewBackgroundResponseLease(
  responseId: string,
  leaseToken: string,
  query: QueryExecutor = write,
): Promise<boolean> {
  const { rows } = await query(sql`/* renewBackgroundResponseLease */
    UPDATE openai_background_responses
    SET lease_expires_at =
      CURRENT_TIMESTAMP + (${BACKGROUND_RESPONSE_LEASE_DURATION_MS} * INTERVAL '1 millisecond')
    WHERE response_id = ${responseId}
      AND lease_token = ${leaseToken}
    RETURNING response_id
  `)
  return rows.length > 0
}

export async function acquireBackgroundResponseLease(
  registration: BackgroundResponseRegistration,
  dependencies: { register?: RegisterLease } = {},
): Promise<OwnedBackgroundResponseLease | undefined> {
  const leaseToken = randomUUID()
  const register = dependencies.register ?? registerWithBoundedTransaction
  let registered: RegisteredBackgroundResponseLease | null
  try {
    registered = await register(registration, leaseToken)
  } catch (firstError) {
    try {
      registered = await register(registration, leaseToken)
    } catch (secondError) {
      throw new Error(
        `Background OpenAI response registration could not prove ownership after two attempts: ${registration.responseId}; first failure: ${String(firstError)}`,
        { cause: secondError },
      )
    }
  }
  if (!registered) {
    onError(
      new Error(
        `Background OpenAI response registration is owned by another lease: ${registration.responseId}`,
      ),
    )
    return undefined
  }
  return createBackgroundResponseLeaseController(registered, {
    renew: () => renewBackgroundResponseLease(registered.responseId, registered.leaseToken),
  })
}

async function registerWithBoundedTransaction(
  registration: BackgroundResponseRegistration,
  leaseToken: string,
): Promise<RegisteredBackgroundResponseLease | null> {
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: REGISTRATION_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: REGISTRATION_STATEMENT_TIMEOUT_MS,
  })
  const result = await registerBackgroundResponseLease(registration, leaseToken, query)
  await query.commit()
  return result
}
