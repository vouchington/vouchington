import { write } from '@data-stores/psql'

/** Change only the stored proof to exercise strict signed/durable disagreement. */
export async function setTestSessionMfaVerifiedAt(
  sessionId: string,
  verifiedAt: number | null,
): Promise<void> {
  await write(
    `/* setTestSessionMfaVerifiedAt */ UPDATE user_sessions
    SET device_token_binding = CASE WHEN $2::bigint IS NULL THEN device_token_binding - 'mfa_at'
      ELSE jsonb_set(device_token_binding, '{mfa_at}', to_jsonb($2::bigint), true) END
    WHERE id = $1`,
    [sessionId, verifiedAt],
  )
}

export async function expireTestSessionAuthority(sessionId: string): Promise<void> {
  await write(
    `/* expireTestSessionAuthority */ UPDATE user_sessions
    SET expires_at = clock_timestamp() WHERE id = $1`,
    [sessionId],
  )
}
