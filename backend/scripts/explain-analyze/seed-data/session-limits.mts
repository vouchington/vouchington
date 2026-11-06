import { beginTransaction } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { seedUuid } from './common.mts'

export const SESSION_LIMIT_USER_ID = seedUuid(19_999, '01')
export const SESSION_LIMIT_ACTIVE_COUNT = 1_000
export const SESSION_LIMIT_EXPIRED_COUNT = 10_000
export const SESSION_LIMIT_REVOKED_COUNT = 1_000
const OTHER_SESSION_COUNT = 100_000

/** Dense histories distinguish active rows from retained expired and revoked rows. */
export async function seedSessionLimits(): Promise<void> {
  await using transaction = await beginTransaction()
  const userAgentId = await upsertUserAgentString('Explain session limits', { query: transaction })
  const count =
    SESSION_LIMIT_ACTIVE_COUNT +
    SESSION_LIMIT_EXPIRED_COUNT +
    SESSION_LIMIT_REVOKED_COUNT +
    OTHER_SESSION_COUNT
  await transaction(
    `/* seedSessionLimits */ INSERT INTO user_sessions
       (id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at, revoked_at)
     SELECT id, user_id, id, 'web', $3::uuid,
       CASE WHEN ordinal > $4 AND ordinal <= $4 + $5
         THEN CURRENT_TIMESTAMP - INTERVAL '1 day' ELSE CURRENT_TIMESTAMP + INTERVAL '30 days' END,
       CASE WHEN ordinal > $4 + $5 AND ordinal <= $4 + $5 + $6
         THEN CURRENT_TIMESTAMP ELSE NULL END
     FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS input(id, user_id, ordinal)
     ON CONFLICT (id) DO NOTHING`,
    [
      Array.from({ length: count }, (_, index) => seedUuid(index, 'fd')),
      Array.from({ length: count }, (_, index) =>
        index < count - OTHER_SESSION_COUNT ? SESSION_LIMIT_USER_ID : seedUuid(index % 100, '01'),
      ),
      userAgentId,
      SESSION_LIMIT_ACTIVE_COUNT,
      SESSION_LIMIT_EXPIRED_COUNT,
      SESSION_LIMIT_REVOKED_COUNT,
    ],
  )
  await transaction('/* seedSessionLimits:analyze */ ANALYZE user_sessions')
  await transaction.commit()
}
