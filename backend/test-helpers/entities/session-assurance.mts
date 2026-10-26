import { read, write } from '@data-stores/psql'

export async function getTestStoredSessionAssurance(sessionId: string): Promise<{
  mfaVerifiedAt: Date | null
  hasJsonMfa: boolean
} | null> {
  const { rows } = await read<{ mfa_verified_at: Date | null; has_json_mfa: boolean }>(
    `/* getTestStoredSessionAssurance */
     SELECT mfa_verified_at, device_token_binding ? 'mfa_at' AS has_json_mfa
     FROM user_sessions WHERE id = $1`,
    [sessionId],
  )
  const row = rows[0]
  return row ? { mfaVerifiedAt: row.mfa_verified_at, hasJsonMfa: row.has_json_mfa } : null
}

/** Change only the typed durable proof to exercise strict signed/durable disagreement. */
export async function setTestSessionMfaVerifiedAt(
  sessionId: string,
  verifiedAt: number | null,
): Promise<void> {
  await write(
    `/* setTestSessionMfaVerifiedAt */ UPDATE user_sessions
    SET mfa_verified_at = CASE WHEN $2::bigint IS NULL THEN NULL
      ELSE to_timestamp($2::double precision) END
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
