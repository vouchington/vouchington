import { getCurrentUser } from '@/lib/auth/get-current-user'
import { isModerationStaff } from '@/lib/auth/official-account'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { Post, PostElection, PostCommunity } from '@/types/posts'
import type { PostResponseBody } from '@/types/api-responses'
import { PostDetailView } from './post-detail-view'

interface PostDetailProps {
  post: Post
  election?: PostElection
  existingVoteChoice?: import('@/lib/api/client/elections').ElectionVoteChoice
  html: string
  hideDownCount?: boolean
  initialSaved?: boolean
  initialHidden?: boolean
  community?: PostCommunity | null
  isCommunityMod?: boolean
  isPostPinned?: boolean
  linkEmbed?: PostResponseBody['link_embed']
}

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
    <PostDetailView
      post={post}
      election={election}
      existingVoteChoice={existingVoteChoice}
      html={html}
      hideDownCount={hideDownCount}
      initialSaved={initialSaved}
      initialHidden={initialHidden}
      isOwner={currentUser?.id === post.created_by_id}
      isAdmin={currentUser?.roles.includes('administrator') ?? false}
      isModerator={isModerationStaff(currentUser) || isCommunityMod === true}
      currentUserId={currentUser?.id ?? null}
      labels={{
        underReview: t('extracted.posts.postDetail.underReview_9e8a3b64'),
        badges: {
          private: t('extracted.posts.postDetailBadges.private_c63eb672'),
          locked: t('extracted.posts.postDetailBadges.locked_a424e33d'),
          followers: t('extracted.posts.postDetailBadges.followers_a145ab34'),
          signedIn: t('extracted.posts.postDetailBadges.signedIn_f44ee573'),
          mutual: t('extracted.posts.postDetailBadges.mutual_1f363d20'),
        },
        ratingAriaLabel: (name, rating) =>
          t('extracted.posts.postDetailBadges.nameRatingOutOf5Stars_0af58dda', {
            name,
            rating,
          }),
        postedBy: authorName =>
          t('extracted.posts.postDetailMetadata.postedByAuthorname_425d3980', { authorName }),
        metadataSeparator: t('extracted.posts.postDetailMetadata.text_4f8865ab'),
        dataPoint: {
          creditCard: t('extracted.posts.dataPointDetail.creditCardDataPoint_7ab2e7d7'),
          bankAccount: t('extracted.posts.dataPointDetail.bankAccountDataPoint_06847f5e'),
        },
      }}
      community={community}
      isCommunityMod={isCommunityMod}
      isPostPinned={isPostPinned}
      linkEmbed={linkEmbed}
    />
  )
}
