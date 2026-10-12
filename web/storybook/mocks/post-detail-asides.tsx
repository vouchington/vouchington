'use client'

import { createContext, useContext, type ReactNode } from 'react'

import { FollowContextCard } from '@/components/social/follow-context-card'
import { PostRelatedTopicsAsideContent } from '@/components/tags/post-related-topics-aside-content'
import { PostRelatedPostsAsideContent } from '@/components/tags/post-related-posts-aside-content'
import { PostRelatedUrlsAsideContent } from '@/components/tags/post-related-urls-aside-content'
import { ReferralLinksAsideContent } from '@/components/referral-links/referral-links-aside-content'
import { HnDiscussionsAsideContent } from '@/components/asides/hn-discussions-aside'
import { collectHnDiscussionUrls } from '@/lib/hn-discussions/normalize-url'
import { useAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getTopicTypeSlug } from '@/types/topics'
import type { Post } from '@/types/posts'
import { posts } from '@/storybook/entities/fixtures/posts'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import {
  postAsideTopicRelations,
  postAsidePostRelations,
  postAsideUrlRelations,
  postAsideReferralResponse,
  postAsideHnThreads,
} from './post-detail-asides-data'

const EMPTY_EXTRA_URLS: Array<string | null | undefined> = []

const HnPreferenceContext = createContext(false)

export function PostAsideFixturePreferences({
  children,
  importHackerNews,
}: {
  children: ReactNode
  importHackerNews: boolean
}) {
  return (
    <HnPreferenceContext.Provider value={importHackerNews}>{children}</HnPreferenceContext.Provider>
  )
}

// Preserve the production composite and synchronous views; only its server data producers
// are replaced. Synchronous content and its normal client interactions remain intact.
export default function PostFollowContext({ id }: { id: string }) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  if (!currentUser || !posts.some(post => post.id === id)) return null
  return (
    <FollowContextCard
      title={t('extracted.posts.postFollowContext.fromPeopleYouFollow_b18bce42')}
      sections={[
        {
          title: t('extracted.posts.postFollowContext.positiveSignalsForThisPost_d8f42fe5'),
          data: { total: 1, users: [publicUsers[0]!] },
          emptyLabel: t(
            'extracted.posts.postFollowContext.noFollowedUsersLeftAPositiveSignalForThis_2fd3c41d',
          ),
        },
        {
          title: t('extracted.posts.postFollowContext.negativeSignalsForThisPost_58b3d283'),
          data: { total: 0, users: [] },
          emptyLabel: t(
            'extracted.posts.postFollowContext.noFollowedUsersLeftANegativeSignalForThis_a138e433',
          ),
        },
      ]}
    />
  )
}

export function PostRelatedTopicsAside({ post }: { post: Post }) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  return (
    <PostRelatedTopicsAsideContent
      post={post}
      relations={postAsideTopicRelations}
      t={t}
      showManageButton={currentUser !== null}
      showVoting={currentUser !== null}
      isAuthenticated={currentUser !== null}
    />
  )
}

export function PostRelatedPostsAside({ post }: { post: Post }) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  return (
    <PostRelatedPostsAsideContent
      post={post}
      relations={postAsidePostRelations}
      t={t}
      showManageButton={currentUser !== null}
      showVoting={currentUser !== null}
      isAuthenticated={currentUser !== null}
    />
  )
}

export function PostRelatedUrlsAside({ post }: { post: Post }) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  return (
    <PostRelatedUrlsAsideContent
      post={post}
      relations={postAsideUrlRelations}
      t={t}
      showManageButton={currentUser !== null}
      showVoting={currentUser !== null}
      isAuthenticated={currentUser !== null}
    />
  )
}

export function PostReviewReferralLinksAside({ post }: { post: Post }) {
  if (post.post_type !== 'review') return null
  for (const rating of post.review_topic_ratings ?? []) {
    const topic = rating.topic
    if (!topic) continue
    const programId = topic.topic_type === 'referral_program' ? topic.id : topic.referral_program_id
    if (!programId) continue
    return (
      <ReferralLinksAsideContent
        topicId={programId}
        topicSlug={
          topic.topic_type === 'referral_program' ? topic.slug : topic.referral_program_slug
        }
        topicType={getTopicTypeSlug('referral_program')}
        response={postAsideReferralResponse(programId)}
      />
    )
  }
  return null
}

export function HnDiscussionsPostAside({
  extraUrls = EMPTY_EXTRA_URLS,
  post,
}: {
  extraUrls?: Array<string | null | undefined>
  post: Post
}) {
  const importHackerNews = useContext(HnPreferenceContext)
  // Only canonical owned posts have related URLs; extra URLs retain production normalization.
  const relatedUrls = posts.some(candidate => candidate.id === post.id)
    ? postAsideUrlRelations.map(relation => relation.object_data.url)
    : []
  const urls = collectHnDiscussionUrls(
    [...extraUrls, ...relatedUrls].map(url => (typeof url === 'string' ? url : null)),
  )
  if (!importHackerNews || urls.length === 0) return null
  return <HnDiscussionsAsideContent threads={postAsideHnThreads} />
}
