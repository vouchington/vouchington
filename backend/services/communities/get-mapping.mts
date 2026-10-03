import type { CommunityOwner } from './search-types.mts'
import type { Community } from './types.mts'

export type CommunityWithOwner = Community & { owner: CommunityOwner | null }

export type CommunityRowWithOwner = Community & {
  owner_id: string | null
  owner_username: string | null
  owner_account_type: CommunityOwner['account_type']
}

export function mapCommunityWithOwner(row: CommunityRowWithOwner): CommunityWithOwner {
  const { owner_id, owner_username, owner_account_type, ...community } = row
  return {
    ...community,
    owner: owner_id
      ? { id: owner_id, username: owner_username, account_type: owner_account_type }
      : null,
  }
}
