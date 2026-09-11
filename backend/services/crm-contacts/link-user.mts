import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { validateUUID } from '@modules/utils'
import type { PrivateUser } from '@services/users/types'
import type { CrmContact } from './types.mts'
import { currentUserCanManageCrm } from './authorization.mts'
import { getCrmContact } from './get.mts'

export async function linkCrmContactToUser(
  currentUser: PrivateUser,
  contactId: string,
  userId: string,
): Promise<CrmContact> {
  assert(currentUserCanManageCrm(currentUser), 403, 'Forbidden')
  validateUUID(userId)

  const { rowCount } = await write(sql`/* linkCrmContactToUser */
    WITH existing_contact AS (
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
        'mark_converted',
        ${currentUser.id},
        contacted_at,
        responded_at,
        NOW(),
        opted_out_at,
        archived_at
      FROM existing_contact
      WHERE converted_at IS NULL
      RETURNING id, crm_contact_id, converted_at
    )
    UPDATE crm_contacts
    SET user_id = ${userId},
        converted_at = COALESCE(inserted_change.converted_at, crm_contacts.converted_at),
        latest_lifecycle_change_id = COALESCE(
          inserted_change.id,
          crm_contacts.latest_lifecycle_change_id
        ),
        updated_at = CURRENT_TIMESTAMP
    FROM existing_contact
    LEFT JOIN inserted_change ON inserted_change.crm_contact_id = existing_contact.id
    WHERE crm_contacts.id = existing_contact.id
  `)
  assert(rowCount, 404, 'Contact not found')

  return (await getCrmContact(contactId))!
}

export async function unlinkCrmContactFromUser(
  currentUser: PrivateUser,
  contactId: string,
): Promise<CrmContact> {
  assert(currentUserCanManageCrm(currentUser), 403, 'Forbidden')

  const { rowCount } = await write(sql`/* unlinkCrmContactFromUser */
    WITH existing_contact AS (
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
        'clear_converted',
        ${currentUser.id},
        contacted_at,
        responded_at,
        NULL,
        opted_out_at,
        archived_at
      FROM existing_contact
      WHERE converted_at IS NOT NULL
      RETURNING id, crm_contact_id
    )
    UPDATE crm_contacts
    SET user_id = NULL,
        converted_at = NULL,
        latest_lifecycle_change_id = COALESCE(
          inserted_change.id,
          crm_contacts.latest_lifecycle_change_id
        ),
        updated_at = CURRENT_TIMESTAMP
    FROM existing_contact
    LEFT JOIN inserted_change ON inserted_change.crm_contact_id = existing_contact.id
    WHERE crm_contacts.id = existing_contact.id
  `)
  assert(rowCount, 404, 'Contact not found')

  return (await getCrmContact(contactId))!
}
