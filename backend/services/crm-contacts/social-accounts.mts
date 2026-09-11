import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { dedupeByLast } from '@ts-shared/utils/collections'
import type { CrmSocialPlatform } from '@voucha/types/entities/crm-contact'
import { currentUserCanManageCrm } from './authorization.mts'

export async function upsertCrmContactSocialAccounts(
  currentUser: PrivateUser,
  contactId: string,
  socialAccounts: Array<{ platform: CrmSocialPlatform; handle: string }>,
): Promise<void> {
  assert(currentUserCanManageCrm(currentUser), 403, 'Forbidden')
  if (socialAccounts.length === 0) return

  const deduplicatedAccounts = dedupeByLast(socialAccounts, account => account.platform)

  const query = sql`/* upsertCrmContactSocialAccounts */
    INSERT INTO crm_contact_social_accounts (contact_id, platform, handle)
    SELECT ${contactId}::uuid AS contact_id, input.platform, input.handle
    FROM unnest(
      ${deduplicatedAccounts.map(account => account.platform)}::crm_social_platforms[],
      ${deduplicatedAccounts.map(account => account.handle.trim())}::text[]
    ) AS input(platform, handle)
    ORDER BY contact_id ASC NULLS LAST, input.platform ASC NULLS LAST
    ON CONFLICT (contact_id, platform) DO UPDATE SET
      handle = EXCLUDED.handle,
      updated_at = CURRENT_TIMESTAMP
  `

  await write(query)
}
