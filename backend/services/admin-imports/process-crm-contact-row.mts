import {
  getCrmContactByEmail,
  createCrmContact,
  updateCrmContact,
  upsertCrmContactSocialAccounts,
} from '@services/crm-contacts'
import type { PrivateUser } from '@services/users/types'
import type { ImportRow } from './types.mts'
import type { CrmContactImportRow } from './validate-crm-contacts.mts'
import type { CrmContactVertical, CrmSocialPlatform } from '@voucha/types/entities/crm-contact'

const SOCIAL_PLATFORMS: CrmSocialPlatform[] = ['instagram', 'tiktok', 'youtube', 'x', 'linkedin']

export async function processCrmContactRow(admin: PrivateUser, row: ImportRow): Promise<string> {
  const input = row.input_data as CrmContactImportRow

  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()

  const existing = await getCrmContactByEmail(email)

  const socialAccounts = SOCIAL_PLATFORMS.flatMap(platform => {
    const handle = (input as Record<string, string>)[platform]?.trim()
    if (!handle) return []
    return [{ platform, handle }]
  })

  const hasVertical = 'vertical' in input
  const verticalRaw = input.vertical?.trim()
  const vertical = verticalRaw ? (verticalRaw as CrmContactVertical) : null

  const hasPhone = 'phone' in input
  const phone = input.phone?.trim() || null

  const hasFollowerCount = 'follower_count' in input
  const followerCount = input.follower_count?.trim() ? Number(input.follower_count.trim()) : null

  const hasNotes = 'notes' in input
  const notes = input.notes?.trim() || null

  if (existing) {
    const updates: Parameters<typeof updateCrmContact>[2] = {}
    if (name && name !== existing.name) updates.name = name
    if (hasPhone && phone !== existing.phone) updates.phone = phone
    if (hasVertical && vertical !== existing.vertical) updates.vertical = vertical
    if (hasFollowerCount && followerCount !== existing.follower_count) {
      updates.follower_count = followerCount
    }
    if (hasNotes && notes !== existing.notes) updates.notes = notes

    if (Object.keys(updates).length > 0) {
      await updateCrmContact(admin, existing.id, updates)
    }

    if (socialAccounts.length > 0) {
      await upsertCrmContactSocialAccounts(admin, existing.id, socialAccounts)
    }

    return existing.id
  }

  const contact = await createCrmContact(admin, {
    name,
    email,
    phone,
    vertical,
    follower_count: followerCount,
    notes,
    source: 'csv_import',
    social_accounts: socialAccounts,
  })

  return contact.id
}
