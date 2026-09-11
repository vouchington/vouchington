import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function wasCrmContactEmailOptedOut(email: string): Promise<boolean> {
  const { rows } = await read(sql`/* wasCrmContactEmailOptedOut */
    SELECT 1
    FROM crm_contacts
    WHERE email = ${email.trim().toLowerCase()}
      AND opted_out_at IS NOT NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function optOutCrmContactByEmail(email: string): Promise<void> {
  await write(sql`/* optOutCrmContactByEmail */
    WITH contact_to_update AS (
      SELECT id
      FROM crm_contacts
      WHERE email = ${email.trim().toLowerCase()}
        AND opted_out_at IS NULL
      FOR UPDATE
    ),
    inserted_change AS (
      INSERT INTO crm_contact_lifecycle_changes (
        crm_contact_id,
        change_type,
        changed_by_id,
        contacted_at,
        responded_at,
        converted_at,
        opted_out_at,
        archived_at
      )
      SELECT
        crm_contacts.id,
        'mark_opted_out',
        NULL,
        crm_contacts.contacted_at,
        crm_contacts.responded_at,
        crm_contacts.converted_at,
        NOW(),
        crm_contacts.archived_at
      FROM crm_contacts
      JOIN contact_to_update ON contact_to_update.id = crm_contacts.id
      RETURNING id, crm_contact_id, opted_out_at
    )
    UPDATE crm_contacts
    SET opted_out_at = inserted_change.opted_out_at,
        latest_lifecycle_change_id = inserted_change.id,
        updated_at = CURRENT_TIMESTAMP
    FROM inserted_change
    WHERE crm_contacts.id = inserted_change.crm_contact_id
  `)
}
