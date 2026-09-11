import type { PostOverflowViewModel } from './post-detail-overflow-guard'

export interface PostDetailOverflowMenuProps {
  post: PostOverflowViewModel
  communitySlug?: string | null
  isCommunityMod?: boolean
  isPostPinned?: boolean
  className?: string
}
