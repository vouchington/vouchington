import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { CrmContact, UpdateCrmContactInput } from './types.mts'
import { currentUserCanManageCrm } from './authorization.mts'
import { getCrmContact } from './get.mts'
import { optOutCrmContactByEmail, wasCrmContactEmailOptedOut } from './opt-out.mts'
type CrmContactLifecycleSnapshot = Pick<
  CrmContact,
  'contacted_at' | 'responded_at' | 'converted_at' | 'opted_out_at'
>
function timestampChanged(previous: Date | null, next: Date | null | undefined): boolean {
  if (next === undefined) return false
  if (previous === null || next === null) return previous !== next
  return previous.getTime() !== next.getTime()
}
export async function updateCrmContact(
  currentUser: PrivateUser,
  contactId: string,
  input: UpdateCrmContactInput,
): Promise<CrmContact> {
  assert(currentUserCanManageCrm(currentUser), 403, 'Forbidden')
  if (input.name != null) {
    assert(input.name.trim().length > 0, 422, 'name must not be empty')
    assert(input.name.trim().length <= 500, 422, 'name must be at most 500 characters')
  }
  if (input.email != null) {
    assert(input.email.trim().length > 0, 422, 'email must not be empty')
    assert(input.email.trim().length <= 320, 422, 'email must be at most 320 characters')
  }

  if (input.follower_count != null) {
    assert(
      Number.isInteger(input.follower_count) && input.follower_count >= 0,
      422,
      'follower_count must be a non-negative integer',
    )
  }

  const updateQuery = sql`/* updateCrmContact */
    UPDATE crm_contacts
    SET updated_at = CURRENT_TIMESTAMP
  `

  if ('name' in input && input.name != null) updateQuery.append(sql`, name = ${input.name.trim()}`)
  if ('email' in input && input.email != null)
    updateQuery.append(sql`, email = ${input.email.trim().toLowerCase()}`)
  if ('phone' in input) updateQuery.append(sql`, phone = ${input.phone ?? null}`)
  if ('vertical' in input) updateQuery.append(sql`, vertical = ${input.vertical ?? null}`)
  if ('contact_type' in input && input.contact_type != null)
    updateQuery.append(sql`, contact_type = ${input.contact_type}`)
  if ('follower_count' in input)
    updateQuery.append(sql`, follower_count = ${input.follower_count ?? null}`)
  if ('notes' in input) updateQuery.append(sql`, notes = ${input.notes ?? null}`)
  if ('metadata' in input)
    updateQuery.append(sql`, metadata = ${input.metadata ? JSON.stringify(input.metadata) : null}`)
  if ('assigned_to_id' in input)
    updateQuery.append(sql`, assigned_to_id = ${input.assigned_to_id ?? null}`)
  if ('contacted_at' in input)
    updateQuery.append(sql`, contacted_at = ${input.contacted_at ?? null}`)
  if ('responded_at' in input)
    updateQuery.append(sql`, responded_at = ${input.responded_at ?? null}`)
  if ('converted_at' in input)
    updateQuery.append(sql`, converted_at = ${input.converted_at ?? null}`)
  if ('opted_out_at' in input)
    updateQuery.append(sql`, opted_out_at = ${input.opted_out_at ?? null}`)

  updateQuery.append(sql` WHERE id = ${contactId}`)

  const lifecycleChanged =
    'contacted_at' in input ||
    'responded_at' in input ||
    'converted_at' in input ||
    'opted_out_at' in input

  await using query = await beginTransaction()

  let lifecycleSnapshot: CrmContactLifecycleSnapshot | null = null
  if (lifecycleChanged) {
    const { rows } = await query(sql`/* updateCrmContact:getLifecycleSnapshot */
        SELECT contacted_at, responded_at, converted_at, opted_out_at
        FROM crm_contacts
        WHERE id = ${contactId}
        FOR UPDATE
      `)
    lifecycleSnapshot = (rows[0] as CrmContactLifecycleSnapshot | undefined) ?? null
  }

  const { rowCount } = await query(updateQuery)
  assert(rowCount, 404, 'Contact not found')

  if (lifecycleChanged) {
    assert(lifecycleSnapshot, 404, 'Contact not found')

    const lifecycleActuallyChanged =
      timestampChanged(lifecycleSnapshot.contacted_at, input.contacted_at) ||
      timestampChanged(lifecycleSnapshot.responded_at, input.responded_at) ||
      timestampChanged(lifecycleSnapshot.converted_at, input.converted_at) ||
      timestampChanged(lifecycleSnapshot.opted_out_at, input.opted_out_at)

    if (lifecycleActuallyChanged) {
      await query(sql`/* updateCrmContact:recordLifecycleChange */
      WITH inserted_change AS (
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
          'manual_update',
          ${currentUser.id},
          contacted_at,
          responded_at,
          converted_at,
          opted_out_at,
          archived_at
        FROM crm_contacts
        WHERE id = ${contactId}
        RETURNING id, crm_contact_id
      )
      UPDATE crm_contacts
      SET latest_lifecycle_change_id = inserted_change.id
      FROM inserted_change
      WHERE crm_contacts.id = inserted_change.crm_contact_id
    `)
    }
  }

  await query.commit()

  if ('email' in input && input.email != null) {
    const email = input.email.trim().toLowerCase()
    if (await wasCrmContactEmailOptedOut(email)) {
      await optOutCrmContactByEmail(email)
    }
  }

  return (await getCrmContact(contactId))!
}

export async function markCrmContactContacted(
  contactId: string,
  changedById?: string | null,
): Promise<void> {
  await write(sql`/* markCrmContactContacted */
    WITH contact_to_update AS (
      SELECT id
      FROM crm_contacts
      WHERE id = ${contactId}
        AND contacted_at IS NULL
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
        'mark_contacted',
        ${changedById ?? null},
        NOW(),
        crm_contacts.responded_at,
        crm_contacts.converted_at,
        crm_contacts.opted_out_at,
        crm_contacts.archived_at
      FROM crm_contacts
      JOIN contact_to_update ON contact_to_update.id = crm_contacts.id
      RETURNING id, crm_contact_id, contacted_at
    )
    UPDATE crm_contacts
    SET contacted_at = inserted_change.contacted_at,
        latest_lifecycle_change_id = inserted_change.id,
        updated_at = CURRENT_TIMESTAMP
    FROM inserted_change
    WHERE crm_contacts.id = inserted_change.crm_contact_id
  `)
}
