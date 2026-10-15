import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestEmailAddressLoginTokenId(
  emailAddress: string,
  id: string,
): Promise<number> {
  const { rowCount } = await write(
    sql`/* setTestEmailAddressLoginTokenId */
      UPDATE email_address_login_tokens SET id = ${id}
      WHERE email_address = ${emailAddress} AND logged_in_at IS NULL`,
  )
  return rowCount ?? 0
}

export async function setTestPhoneNumberLoginTokenId(
  phoneNumber: string,
  id: string,
): Promise<number> {
  const { rowCount } = await write(
    sql`/* setTestPhoneNumberLoginTokenId */
      UPDATE phone_number_login_tokens SET id = ${id}
      WHERE phone_number = ${phoneNumber} AND logged_in_at IS NULL`,
  )
  return rowCount ?? 0
}
