import type { CommunityOwner } from './search.mts'
import type { Community } from './types.mts'

export type CommunityWithOwner = Community & { owner: CommunityOwner | null }

export type CommunityRowWithOwner = Community & {
  owner_id: string | null
  owner_username: string | null
  lingua_rs_content_sha256?: unknown
  lingua_rs_input_sha256?: unknown
  lingua_rs_results?: unknown
  lingua_rs_detected_at?: unknown
}

export function mapCommunityWithOwner(row: CommunityRowWithOwner): CommunityWithOwner {
  const {
    owner_id,
    owner_username,
    lingua_rs_content_sha256: _contentSha256,
    lingua_rs_input_sha256: _inputSha256,
    lingua_rs_results: _results,
    lingua_rs_detected_at: _detectedAt,
    ...community
  } = row
  return {
    ...community,
    owner: owner_id ? { id: owner_id, username: owner_username } : null,
  }
}
