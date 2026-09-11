import { PostRelatedPostsAside } from '@/components/tags/post-related-posts-aside'
import { PostRelatedTopicsAside } from '@/components/tags/post-related-topics-aside'
import { PostRelatedUrlsAside } from '@/components/tags/post-related-urls-aside'
import { HnDiscussionsPostAside } from '@/components/asides/hn-discussions-post-aside'
import { ContributeCtaAside } from '@/components/asides/contribute-cta-aside'
import PostFollowContext from '@/components/posts/post-follow-context'
import { PostReviewReferralLinksAside } from '@/components/posts/post-review-referral-links-aside'
import { PostAuthorAside } from '@/components/posts/post-author-aside'
import type { Post, AuthorAside } from '@/types/posts'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'

const EMPTY_SOURCE_URLS: Array<string | null | undefined> = []

interface PostDetailAsideProps {
  post: Post
  authorAside: AuthorAside | null
  sourceUrls?: Array<string | null | undefined>
}

export function PostDetailAside({
  post,
  authorAside,
  sourceUrls = EMPTY_SOURCE_URLS,
}: PostDetailAsideProps) {
  return (
    <>
      {post.created_by && !post.is_anonymous && (
        <PostAuthorAside
          author={post.created_by}
          aside={authorAside}
          postType={post.post_type}
        />
      )}
      <SequentialAsideSuspense>
        <PostFollowContext id={post.id} />
        <PostReviewReferralLinksAside post={post} />
        <PostRelatedTopicsAside post={post} />
        <PostRelatedPostsAside post={post} />
        <PostRelatedUrlsAside post={post} />
        <HnDiscussionsPostAside
          post={post}
          extraUrls={sourceUrls}
        />
        <ContributeCtaAside />
      </SequentialAsideSuspense>
    </>
  )
}
