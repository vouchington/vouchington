import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function clearMfaForUser(userId: string): Promise<void> {
  await write(allowUnannotatedQuery(sql`DELETE FROM user_passkeys WHERE user_id = ${userId}`))
  await write(
    allowUnannotatedQuery(sql`DELETE FROM user_totp_authenticators WHERE user_id = ${userId}`),
  )
}

export async function setUserMarkdown(userId: string, markdown: string): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`UPDATE users SET markdown = ${markdown} WHERE id = ${userId}`),
  )
}
