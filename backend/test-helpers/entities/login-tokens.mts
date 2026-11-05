import { hashToken } from '@modules/token-secrets'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestEmailAddressLoginTokenId(
  emailAddress: string,
  id: string,
): Promise<number> {
  const { rowCount } = await write(
    sql`/* setTestEmailAddressLoginTokenId */
      UPDATE email_address_login_tokens SET id = ${id}
      WHERE email_address = ${emailAddress} AND consumed_at IS NULL`,
  )
  return rowCount ?? 0
}

export async function getTestEmailLoginTokenState(
  emailAddress: string,
  token: string,
): Promise<{
  invalidated: boolean
  consumed: boolean
} | null> {
  const tokenHash = hashToken('email-address-login-token', token.toUpperCase())
  const { rows } = await read<{ invalidated: boolean; consumed: boolean }>(sql`
    /* getTestEmailLoginTokenState */ SELECT
      invalidated_at IS NOT NULL AS invalidated, consumed_at IS NOT NULL AS consumed
    FROM email_address_login_tokens
    WHERE email_address = ${emailAddress} AND token = ${tokenHash} AND purpose = 'login'
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function getTestEmailReAuthTokenState(
  sessionId: string,
  code: string,
): Promise<{
  invalidated: boolean
  consumed: boolean
} | null> {
  const tokenHash = hashToken(`email-address-re-auth-token:${sessionId}`, code.toUpperCase())
  const { rows } = await read<{ invalidated: boolean; consumed: boolean }>(sql`
    /* getTestEmailReAuthTokenState */ SELECT
      invalidated_at IS NOT NULL AS invalidated, consumed_at IS NOT NULL AS consumed
    FROM email_address_login_tokens
    WHERE token = ${tokenHash} AND reauthentication_session_id = ${sessionId}
    LIMIT 1
  `)
  return rows[0] ?? null
}
