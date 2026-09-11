import type { PrivateUser } from '@voucha/types/entities/user'
import type { CrmContact } from '@voucha/types/entities/crm-contact'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export { insertTestCrmNote } from './crm-notes.mts'
export { insertTestCrmThread, insertTestCrmMessage } from './crm-conversations.mts'

export type TestCrmContactLifecycleChange = {
  change_type: string
  changed_by_id: string | null
  contacted_at: Date | null
  responded_at: Date | null
  converted_at: Date | null
  opted_out_at: Date | null
  archived_at: Date | null
}
type CreateTestCrmContactOptions = {
  name?: string
  email?: string
  vertical?: NonNullable<CrmContact['vertical']>
  notes?: string
  // Derives the contact's status (see @services/crm-contacts/search.mts's CASE expression):
  // setting this produces a 'awaiting_response' contact instead of the default 'new'.
  contactedAt?: Date
}
// Raw-primitive substitute for @services/crm-contacts' createCrmContact, restricted to the fixed
// { name, email, vertical, notes, contactedAt } shape this file always passes (never
// social_accounts, phone, or follower_count) — this package must never depend on a service that
// already devDeps this package for its own tests. Intentionally skips the real function's
// currentUserCanManageCrm authorization check and input-length validation, since test fixtures
// control both the "admin" argument and the input values directly. Column list mirrors
// @services/crm-contacts/get.mts's getCrmContact query.
export async function createTestCrmContact(
  admin: PrivateUser,
  options: CreateTestCrmContactOptions = {},
): Promise<CrmContact> {
  const suffix = Math.random().toString(36).slice(2, 10)
  const { rows } = await write<CrmContact>(sql`/* createTestCrmContact */
    INSERT INTO crm_contacts (name, email, vertical, notes, contacted_at, created_by_id)
    VALUES (
      ${options.name ?? `Test Contact ${suffix}`},
      ${options.email ?? `tests+test-crm-${suffix}@voucha.ai`},
      ${options.vertical ?? null},
      ${options.notes ?? null},
      ${options.contactedAt ?? null},
      ${admin.id}
    )
    RETURNING
      id, name, email, phone, vertical, contact_type, source, follower_count, notes,
      metadata, user_id, assigned_to_id, created_by_id, contacted_at, responded_at,
      converted_at, opted_out_at, archived_at, created_at, updated_at,
      'crm_contact' AS __entity_type
  `)
  return rows[0]!
}

// Raw-primitive substitute for @services/crm-contacts' upsertCrmContactSocialAccounts, for tests
// that only need one seeded social account row without exercising the real dedupe/upsert logic.
export async function insertTestCrmContactSocialAccount(
  contactId: string,
  options: { platform?: string; handle?: string } = {},
): Promise<{ id: string; platform: string; handle: string }> {
  const suffix = Math.random().toString(36).slice(2, 10)
  const { rows } = await write<{ id: string; platform: string; handle: string }>(sql`
    /* insertTestCrmContactSocialAccount */
    INSERT INTO crm_contact_social_accounts (contact_id, platform, handle)
    VALUES (
      ${contactId},
      ${options.platform ?? 'instagram'},
      ${options.handle ?? `test-handle-${suffix}`}
    )
    RETURNING id, platform, handle
  `)
  return rows[0]!
}

export async function linkTestCrmContactToUser(contactId: string, userId: string): Promise<void> {
  await write(sql`/* linkTestCrmContactToUser */
    UPDATE crm_contacts
    SET user_id = ${userId}
    WHERE id = ${contactId}
  `)
}

export async function getTestCrmContactLifecycleChanges(
  contactId: string,
): Promise<TestCrmContactLifecycleChange[]> {
  const { rows } = await read(sql`/* getTestCrmContactLifecycleChanges */
    SELECT change_type, changed_by_id, contacted_at, responded_at, converted_at, opted_out_at, archived_at
    FROM crm_contact_lifecycle_changes
    WHERE crm_contact_id = ${contactId}
    ORDER BY id ASC
  `)
  return rows as TestCrmContactLifecycleChange[]
}
