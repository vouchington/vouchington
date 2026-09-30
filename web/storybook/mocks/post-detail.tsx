'use client'

import { useAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  PostDetailWithViewer,
  type PostDetailProps,
} from '../../components/posts/post-detail-with-viewer'

export function PostDetail({
  post,
  election,
  existingVoteChoice,
  html,
  hideDownCount = true,
  initialSaved = false,
  initialHidden = false,
  community,
  isCommunityMod,
  isPostPinned,
  linkEmbed,
}: PostDetailProps) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  return (
    <PostDetailWithViewer
      post={post}
      election={election}
      existingVoteChoice={existingVoteChoice}
      html={html}
      hideDownCount={hideDownCount}
      initialSaved={initialSaved}
      initialHidden={initialHidden}
      community={community}
      isCommunityMod={isCommunityMod}
      isPostPinned={isPostPinned}
      linkEmbed={linkEmbed}
      currentUser={currentUser}
      t={t}
    />
  )
}
