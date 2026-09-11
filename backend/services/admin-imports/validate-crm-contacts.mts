import type { BatchValidationResult, RowValidationResult } from './types.mts'

export const CRM_CONTACT_ALLOWED_COLUMNS = new Set([
  'name',
  'email',
  'phone',
  'vertical',
  'follower_count',
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'linkedin',
  'notes',
])

const VALID_VERTICALS = new Set([
  'credit_cards',
  'travel',
  'cars',
  'ai',
  'technology',
  'finance',
  'lifestyle',
  'other',
])

const SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'x', 'linkedin'] as const

export type CrmContactImportRow = {
  name: string
  email: string
  phone?: string
  vertical?: string
  follower_count?: string
  instagram?: string
  tiktok?: string
  youtube?: string
  x?: string
  linkedin?: string
  notes?: string
}

export function validateCrmContactHeaders(headers: string[]): string[] {
  return headers.filter(h => !CRM_CONTACT_ALLOWED_COLUMNS.has(h))
}

export function validateCrmContactRows(rows: Record<string, string>[]): BatchValidationResult {
  const results: RowValidationResult[] = []
  const seenEmails = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const errors: string[] = []

    if (!row || typeof row !== 'object') {
      errors.push('Row must be an object')
      results.push({ row_index: i, valid: false, errors })
      continue
    }

    const name = row.name?.trim()
    if (!name) {
      errors.push('name is required')
    } else if (name.length > 500) {
      errors.push('name must be at most 500 characters')
    }

    const email = row.email?.trim().toLowerCase()
    if (!email) {
      errors.push('email is required')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('email must be a valid email address')
    } else if (email.length > 320) {
      errors.push('email must be at most 320 characters')
    } else if (seenEmails.has(email)) {
      errors.push(`email "${email}" is duplicated in this batch`)
    } else {
      seenEmails.add(email)
    }

    const vertical = row.vertical?.trim()
    if (vertical && !VALID_VERTICALS.has(vertical)) {
      errors.push(`vertical must be one of: ${[...VALID_VERTICALS].join(', ')}`)
    }

    const followerCount = row.follower_count?.trim()
    if (followerCount) {
      const parsed = Number(followerCount)
      if (!Number.isInteger(parsed) || parsed < 0) {
        errors.push('follower_count must be a non-negative integer')
      }
    }

    for (const platform of SOCIAL_PLATFORMS) {
      const handle = row[platform]?.trim()
      if (handle && handle.length > 200) {
        errors.push(`${platform} handle must be at most 200 characters`)
      }
    }

    results.push({ row_index: i, valid: errors.length === 0, errors })
  }

  return {
    valid: results.every(r => r.valid),
    rows: results,
  }
}
