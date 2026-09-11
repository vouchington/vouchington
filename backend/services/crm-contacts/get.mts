import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import type { CrmContact, CrmContactSocialAccount } from './types.mts'

export async function getCrmContact(id: string): Promise<CrmContact | null> {
  validateUUID(id)
  const { rows } = await read(sql`/* getCrmContact */
    SELECT
      id,
      name,
      email,
      phone,
      vertical,
      contact_type,
      source,
      follower_count,
      notes,
      metadata,
      user_id,
      assigned_to_id,
      created_by_id,
      contacted_at,
      responded_at,
      converted_at,
      opted_out_at,
      archived_at,
      created_at,
      updated_at,
      'crm_contact' AS __entity_type
    FROM crm_contacts
    WHERE id = ${id}
    LIMIT 1
  `)
  return (rows[0] as CrmContact) ?? null
}

export async function getCrmContactByEmail(email: string): Promise<CrmContact | null> {
  const normalizedEmail = email.trim().toLowerCase()
  const { rows } = await read(sql`/* getCrmContactByEmail */
    SELECT
      id,
      name,
      email,
      phone,
      vertical,
      contact_type,
      source,
      follower_count,
      notes,
      metadata,
      user_id,
      assigned_to_id,
      created_by_id,
      contacted_at,
      responded_at,
      converted_at,
      opted_out_at,
      archived_at,
      created_at,
      updated_at,
      'crm_contact' AS __entity_type
    FROM crm_contacts
    WHERE email = ${normalizedEmail}
      AND archived_at IS NULL
    LIMIT 1
  `)
  return (rows[0] as CrmContact) ?? null
}

export async function getCrmContactSocialAccounts(
  contactId: string,
): Promise<CrmContactSocialAccount[]> {
  validateUUID(contactId)
  const { rows } = await read(sql`/* getCrmContactSocialAccounts */
    SELECT
      id,
      contact_id,
      platform,
      handle,
      profile_url,
      follower_count,
      follower_count_updated_at,
      created_at,
      updated_at,
      'crm_contact_social_account' AS __entity_type
    FROM crm_contact_social_accounts
    WHERE contact_id = ${contactId}
    ORDER BY platform
  `)
  return rows as CrmContactSocialAccount[]
}
