import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'
import { PostDetailWithViewer, type PostDetailProps } from './post-detail-with-viewer'

export async function PostDetail({
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
  const [currentUser, t] = await Promise.all([getCurrentUser(), getTranslations()])
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
