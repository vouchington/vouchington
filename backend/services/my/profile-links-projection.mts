import type { ProfileLink } from './profile-links-types.mts'

export type StoredProfileLink = Omit<ProfileLink, 'url' | 'image_placement'>

/** Keep owner-write transition metadata internal to the mutation service. */
export function projectStoredProfileLink(row: StoredProfileLink): StoredProfileLink {
  return {
    id: row.id,
    user_id: row.user_id,
    link_type: row.link_type,
    sort_order: row.sort_order,
    url_id: row.url_id,
    handle: row.handle,
    name: row.name,
    image_id: row.image_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
