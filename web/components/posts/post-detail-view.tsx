import { Card } from '@/components/ui/card'
import type { Post, PostElection, PostCommunity } from '@/types/posts'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { PostDetailActions } from './post-detail-actions'
import type { PostDetailBadgeLabels } from './post-detail-badges'
import { PostDetailMetadata } from './post-detail-metadata'
import type { PostResponseBody } from '@/types/api-responses'
import { PostDetailBody } from './post-detail-body'
import { PostDetailHeading } from './post-detail-heading'

export interface PostDetailViewProps {
  post: Post
  election?: PostElection
  existingVoteChoice?: import('@/lib/api/client/elections').ElectionVoteChoice
  html: string
  hideDownCount?: boolean
  initialSaved?: boolean
  initialHidden?: boolean
  isOwner?: boolean
  isAdmin?: boolean
  currentUserId?: string | null
  labels?: {
    underReview: string
    badges: PostDetailBadgeLabels
    ratingAriaLabel: (name: string, rating: number) => string
    postedBy: (authorName: string) => string
    metadataSeparator: string
    dataPoint: { creditCard: string; bankAccount: string }
  }
  /** True when the viewer is an administrator or moderator — enables the sensitive-media blur gate. */
  isModerator?: boolean
  community?: PostCommunity | null
  isCommunityMod?: boolean
  isPostPinned?: boolean
  linkEmbed?: PostResponseBody['link_embed']
}

const DEFAULT_POST_DETAIL_LABELS: NonNullable<PostDetailViewProps['labels']> = {
  underReview: 'Under review',
  badges: {
    private: 'Private',
    locked: 'Locked',
    followers: 'Followers',
    signedIn: 'Signed In',
    mutual: 'Mutual',
  },
  ratingAriaLabel: (name, rating) => `${name}: ${rating} out of 5 stars`,
  postedBy: authorName => `Posted by ${authorName}`,
  metadataSeparator: '•',
  dataPoint: { creditCard: 'Credit card data point', bankAccount: 'Bank account data point' },
}

export function PostDetailView({
  post,
  election,
  existingVoteChoice,
  html,
  hideDownCount = true,
  initialSaved = false,
  initialHidden = false,
  isOwner = false,
  isAdmin = false,
  isModerator,
  community,
  isCommunityMod,
  isPostPinned,
  linkEmbed,
  currentUserId = null,
  labels = DEFAULT_POST_DETAIL_LABELS,
}: PostDetailViewProps) {
  const authorName = post.created_by?.username ?? (post.is_anonymous ? 'Anonymous' : 'Unknown')
  const canDiscussInCommunity =
    !post.community_id &&
    post.post_type !== 'comment' &&
    post.broadcast === 'everyone' &&
    post.privacy === 'public' &&
    post.clearance_status === 'approved' &&
    !post.locked_at

  return (
    <Card className='relative p-4'>
      <PostDetailHeading
        post={post}
        labels={labels}
        community={community}
        isCommunityMod={isCommunityMod}
        isPostPinned={isPostPinned}
        isOwner={isOwner}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
      >
        <PostDetailBody
          post={post}
          html={html}
          labels={labels}
          isOwner={isOwner}
          isAdmin={isAdmin}
          isModerator={isModerator}
          isCommunityMod={isCommunityMod}
          linkEmbed={linkEmbed}
        />
        <PostDetailMetadata
          authorName={authorName}
          author={post.created_by}
          createdAt={post.created_at}
          bylineLabel={labels.postedBy(authorName)}
          separatorLabel={labels.metadataSeparator}
        />
        <PostDetailActions
          election={
            election
              ? {
                  id: election.id,
                  votesCountUp: election.votes_count_up ?? 0,
                  votesCountDown: election.votes_count_down ?? 0,
                }
              : undefined
          }
          existingVoteChoice={existingVoteChoice}
          hideDownCount={hideDownCount}
          post={{
            id: post.id,
            postType: post.post_type,
            canDiscussInCommunity,
            discussionSource: canDiscussInCommunity
              ? {
                  title: post.title,
                  canonicalPath: getCanonicalPostPath(post),
                }
              : undefined,
          }}
          initialSaved={initialSaved}
          initialHidden={initialHidden}
        />
      </PostDetailHeading>
    </Card>
  )
}
