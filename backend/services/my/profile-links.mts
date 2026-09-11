import { read, write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { addUrl } from '@services/urls/upsert'
import { assertUrlNotBlocked } from '@services/domain-blacklist-check'
import { isHttpUrlWithoutFragment } from '@modules/utils'
export { reorderProfileLinks } from './profile-links-reorder.mts'
export type ProfileLinkType =
  | 'url'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'github'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'
export type ProfileLink = {
  id: string
  user_id: string
  link_type: ProfileLinkType
  sort_order: number
  url_id: string | null
  url: string | null
  handle: string | null
  name: string | null
  image_id: string | null
  created_at: Date
  updated_at: Date
}
type CreateProfileLinkInput = {
  link_type: ProfileLinkType
  url?: string | null
  handle?: string | null
  name?: string | null
  image_id?: string | null
}
type UpdateProfileLinkInput = Omit<CreateProfileLinkInput, 'link_type'>
const VALID_LINK_TYPES: ProfileLinkType[] = [
  'url',
  'twitter',
  'facebook',
  'instagram',
  'github',
  'linkedin',
  'youtube',
  'tiktok',
]
const MAX_PROFILE_LINKS = 20
const VALID_HANDLE_PATTERN = /^[a-zA-Z0-9_-]+$/
function validateProfileUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    assert(false, 400, 'url must be a valid URL')
  }
  assert(
    parsed.protocol === 'http:' || parsed.protocol === 'https:',
    400,
    'url must use http or https',
  )
  assert(parsed.hash === '', 400, 'url must be a valid URL without a fragment')
  assert(isHttpUrlWithoutFragment(url), 400, 'url must be a valid URL')
}
function validateLinkFields(
  linkType: ProfileLinkType,
  url: string | null | undefined,
  handle: string | null | undefined,
): void {
  if (linkType === 'url') {
    assert(typeof url === 'string' && url.length > 0, 400, 'url is required for link_type url')
    validateProfileUrl(url)
  } else if (handle != null && handle !== '') {
    assert(
      VALID_HANDLE_PATTERN.test(handle),
      400,
      'handle must only contain letters, numbers, underscores, and hyphens',
    )
  }
}
async function resolveUrlId(
  userId: string,
  url: string | null | undefined,
): Promise<string | null> {
  if (!url || typeof url !== 'string') return null
  const result = await addUrl(userId, url)
  return result?.id ?? null
}
export async function listProfileLinks(userId: string): Promise<ProfileLink[]> {
  const { rows } = await read(
    sql`/* listProfileLinks */ SELECT pl.id, pl.user_id, pl.link_type, pl.sort_order, pl.url_id, u.url, pl.handle, pl.name, pl.image_id, pl.created_at, pl.updated_at
        FROM user_profile_links pl
        LEFT JOIN urls u ON u.id = pl.url_id
        WHERE pl.user_id = ${userId}
        ORDER BY pl.sort_order ASC, pl.id ASC`,
  )
  return rows
}
export async function createProfileLink(
  userId: string,
  input: CreateProfileLinkInput,
): Promise<ProfileLink> {
  assert(VALID_LINK_TYPES.includes(input.link_type), 400, 'Invalid link_type')
  validateLinkFields(input.link_type, input.url, input.handle)
  if (input.url) await assertUrlNotBlocked(input.url)
  const urlId = await resolveUrlId(userId, input.url)
  // Atomic INSERT: compute next sort_order and enforce per-user limit in one query.
  // HAVING COUNT(*) < MAX_PROFILE_LINKS prevents insert when at the limit.
  const { rows } = await write(sql`/* createProfileLink */
    INSERT INTO user_profile_links (user_id, link_type, sort_order, url_id, handle, name, image_id)
    SELECT
      ${userId}::uuid,
      ${input.link_type}::user_profile_link_types,
      COALESCE(MAX(sort_order), -1) + 1,
      ${urlId},
      ${input.handle ?? null},
      ${input.name ?? null},
      ${input.image_id ?? null}
    FROM user_profile_links
    WHERE user_id = ${userId}
    HAVING COUNT(*) < ${MAX_PROFILE_LINKS}
    RETURNING id, user_id, link_type, sort_order, url_id, handle, name, image_id, created_at, updated_at
  `)
  assert(rows.length > 0, 400, `Maximum of ${MAX_PROFILE_LINKS} profile links allowed`)
  const row = rows[0]
  return { ...row, url: input.url ?? null }
}
export async function updateProfileLink(
  userId: string,
  linkId: string,
  input: UpdateProfileLinkInput,
): Promise<ProfileLink> {
  if (typeof input.url === 'string' && input.url.length > 0) {
    validateProfileUrl(input.url)
    await assertUrlNotBlocked(input.url)
  }
  if (typeof input.handle === 'string' && input.handle.length > 0) {
    assert(
      VALID_HANDLE_PATTERN.test(input.handle),
      400,
      'handle must only contain letters, numbers, underscores, and hyphens',
    )
  }
  const urlId = input.url !== undefined ? await resolveUrlId(userId, input.url) : undefined
  // CASE WHEN preserves existing column values for fields not included in input
  const { rows } = await write(sql`/* updateProfileLink */
    UPDATE user_profile_links
    SET
      url_id = CASE WHEN ${urlId !== undefined} THEN ${urlId ?? null} ELSE url_id END,
      handle = CASE WHEN ${input.handle !== undefined} THEN ${input.handle ?? null} ELSE handle END,
      name = CASE WHEN ${input.name !== undefined} THEN ${input.name ?? null} ELSE name END,
      image_id = CASE WHEN ${input.image_id !== undefined} THEN ${input.image_id ?? null} ELSE image_id END
    WHERE id = ${linkId} AND user_id = ${userId}
    RETURNING id, user_id, link_type, sort_order, url_id, handle, name, image_id, created_at, updated_at
  `)
  assert(rows.length > 0, 404, 'Profile link not found')
  const row = rows[0]
  // For partial updates without url field, fetch the existing url from database
  if (input.url === undefined) {
    const { rows: urlRows } = await read(sql`/* updateProfileLink */
      SELECT u.url
      FROM urls u
      WHERE u.id = ${row.url_id}
    `)
    const existingUrl = urlRows[0]?.url ?? null
    return { ...row, url: existingUrl }
  }
  return { ...row, url: input.url ?? null }
}
export async function deleteProfileLink(userId: string, linkId: string): Promise<void> {
  const { rowCount } = await write(
    sql`/* deleteProfileLink */ DELETE FROM user_profile_links WHERE id = ${linkId} AND user_id = ${userId}`,
  )
  assert(rowCount === 1, 404, 'Profile link not found')
}
