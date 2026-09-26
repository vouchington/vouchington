import type { PostOverflowViewModel } from './post-detail-overflow-guard'

export interface PostDetailOverflowMenuProps {
  post: PostOverflowViewModel
  communitySlug?: string | null
  isCommunityMod?: boolean
  isPostPinned?: boolean
  onPinnedChange?: (isPinned: boolean) => void
  className?: string
}
