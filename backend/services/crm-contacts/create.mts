import { write, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { dedupeByLast } from '@ts-shared/utils/collections'
import type { CrmContact, CreateCrmContactInput } from './types.mts'
import { currentUserCanManageCrm } from './authorization.mts'
import { getCrmContact } from './get.mts'
import { optOutCrmContactByEmail, wasCrmContactEmailOptedOut } from './opt-out.mts'

export async function createCrmContact(
  currentUser: PrivateUser,
  input: CreateCrmContactInput,
): Promise<CrmContact> {
  assert(currentUserCanManageCrm(currentUser), 403, 'Forbidden')
  assert(input.name?.trim(), 422, 'name is required')
  assert(input.email?.trim(), 422, 'email is required')

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()

  assert(name.length <= 500, 422, 'name must be at most 500 characters')
  assert(email.length <= 320, 422, 'email must be at most 320 characters')

  if (input.follower_count != null) {
    assert(
      Number.isInteger(input.follower_count) && input.follower_count >= 0,
      422,
      'follower_count must be a non-negative integer',
    )
  }

  await using query = await beginTransaction()
  const { rows } = await write(
    sql`/* createCrmContact */
      INSERT INTO crm_contacts (
        name, email, phone, vertical, contact_type, source,
        follower_count, notes, metadata, assigned_to_id, created_by_id
      )
      VALUES (
        ${name},
        ${email},
        ${input.phone ?? null},
        ${input.vertical ?? null},
        ${input.contact_type ?? 'influencer'},
        ${input.source ?? 'manual'},
        ${input.follower_count ?? null},
        ${input.notes ?? null},
        ${input.metadata ? JSON.stringify(input.metadata) : null},
        ${input.assigned_to_id ?? null},
        ${currentUser.id}
      )
      RETURNING id
    `,
    { query },
  )

  const id = rows[0].id as string

  if (input.social_accounts && input.social_accounts.length > 0) {
    const deduplicatedAccounts = dedupeByLast(input.social_accounts, account => account.platform)

    const socialQuery = sql`/* createCrmContact_socialAccount */
      INSERT INTO crm_contact_social_accounts (
        contact_id, platform, handle, profile_url, follower_count
      )
      VALUES `

    deduplicatedAccounts.forEach((account, i) => {
      if (i > 0) socialQuery.append(sql`, `)
      socialQuery.append(sql`(
        ${id},
        ${account.platform},
        ${account.handle.trim()},
        ${account.profile_url ?? null},
        ${account.follower_count ?? null}
      )`)
    })

    socialQuery.append(sql`
      ON CONFLICT (contact_id, platform) DO UPDATE SET
        handle = EXCLUDED.handle,
        profile_url = EXCLUDED.profile_url,
        follower_count = EXCLUDED.follower_count,
        updated_at = CURRENT_TIMESTAMP
    `)

    await write(socialQuery, { query })
  }

  const contactId = id

  await query.commit()

  if (await wasCrmContactEmailOptedOut(email)) {
    await optOutCrmContactByEmail(email)
  }

  return (await getCrmContact(contactId))!
}
