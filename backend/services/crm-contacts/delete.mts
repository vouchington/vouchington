import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanManageCrm } from './authorization.mts'

export async function archiveCrmContact(
  currentUser: PrivateUser,
  contactId: string,
): Promise<void> {
  assert(currentUserCanManageCrm(currentUser), 403, 'Forbidden')

  const { rowCount } = await write(sql`/* archiveCrmContact */
    WITH contact_to_archive AS (
      SELECT id, contacted_at, responded_at, converted_at, opted_out_at, archived_at
      FROM crm_contacts
      WHERE id = ${contactId}
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
        id,
        'archive',
        ${currentUser.id},
        contacted_at,
        responded_at,
        converted_at,
        opted_out_at,
        NOW()
      FROM contact_to_archive
      WHERE archived_at IS NULL
      RETURNING id, crm_contact_id, archived_at
    )
    UPDATE crm_contacts
    SET archived_at = COALESCE(inserted_change.archived_at, crm_contacts.archived_at),
        latest_lifecycle_change_id = COALESCE(
          inserted_change.id,
          crm_contacts.latest_lifecycle_change_id
        ),
        updated_at = CURRENT_TIMESTAMP
    FROM contact_to_archive
    LEFT JOIN inserted_change ON inserted_change.crm_contact_id = contact_to_archive.id
    WHERE crm_contacts.id = contact_to_archive.id
  `)
  assert(rowCount, 404, 'Contact not found')
}
