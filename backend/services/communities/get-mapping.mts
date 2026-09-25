import type { CommunityOwner } from './search.mts'
import type { Community } from './types.mts'

export type CommunityWithOwner = Community & { owner: CommunityOwner | null }

export type CommunityRowWithOwner = Community & {
  owner_id: string | null
  owner_username: string | null
}

export function mapCommunityWithOwner(row: CommunityRowWithOwner): CommunityWithOwner {
  const { owner_id, owner_username, ...community } = row
  return {
    ...community,
    owner: owner_id ? { id: owner_id, username: owner_username } : null,
  }
}
