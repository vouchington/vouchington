import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanViewCommunityApplicationQuestions } from '../authorization.mts'
import type { CommunityWithOwner } from '../get.mts'
import { loadCommunityWithViewer } from '../load-with-viewer.mts'

export async function loadCommunityForApplicationQuestions(
  currentUser: PrivateUser | null,
  idOrSlug: string,
): Promise<CommunityWithOwner> {
  const { community, membership } = await loadCommunityWithViewer(idOrSlug, currentUser?.id ?? null)
  assert(
    await currentUserCanViewCommunityApplicationQuestions(currentUser, community, membership),
    404,
    'Community not found',
  )
  return community
}
