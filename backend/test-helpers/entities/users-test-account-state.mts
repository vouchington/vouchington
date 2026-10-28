import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function clearMfaForUser(userId: string): Promise<void> {
  await write(
    sql`/* clearMfaForUser:passkeys */ DELETE FROM user_passkeys WHERE user_id = ${userId}`,
  )
  await write(
    sql`/* clearMfaForUser:totp */ DELETE FROM user_totp_authenticators WHERE user_id = ${userId}`,
  )
}

export async function setUserMarkdown(userId: string, markdown: string): Promise<void> {
  await write(
    sql`/* setUserMarkdown */ UPDATE users SET markdown = ${markdown} WHERE id = ${userId}`,
  )
}
