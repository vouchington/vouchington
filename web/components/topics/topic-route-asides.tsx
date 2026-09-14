import dynamic from 'next/dynamic'
import { TopicRelatedTopicsAside } from '@/components/tags/topic-related-topics-aside'
import { TopicCommunitiesAside } from './topic-communities-aside'
import { TopicFaqPostsAside } from '@/components/tags/topic-faq-posts-aside'
import { TopicPublisherTypesAside } from '@/components/tags/topic-publisher-types-aside'
import { TopicCategoryTagsAside } from '@/components/tags/topic-category-tags-aside'
import { TopicUrlTagAside } from '@/components/tags/topic-url-tag-aside'
import { ReferralLinksAside } from '@/components/referral-links/referral-links-aside'
import { ReferralLinksAsideWrapper } from '@/components/referral-links/referral-links-aside-wrapper'
import { ReferralCtaAside } from '@/components/referral-cta-aside'
import { TopicSourcesAside } from './topic-sources-aside'
import { TopicDescriptionAside } from './topic-description-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'
import { PodcastShowMetadataAside } from '@/components/podcasts/podcast-show-metadata-aside'
import type { getTranslations } from '@/lib/i18n/get-translations'
import type { RssFeedsListResponseBody, TopicResponseBody } from '@/types/api-responses'
import type { HostnameListResponse } from '@/types/hostnames'
import type { TopicActionsAside as TopicActionsAsideComponent } from './topic-actions-aside'
// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const TopicActionsAside = dynamic<Parameters<typeof TopicActionsAsideComponent>[0]>(() =>
  import('./topic-actions-aside').then(mod => mod.TopicActionsAside),
)

interface TopicRouteAsidesProps {
  t: Awaited<ReturnType<typeof getTranslations>>
  topicData: TopicResponseBody
  topicDisplayName: string
  isAuthenticated: boolean
  isMuted: boolean | undefined
  firstRssFeed: RssFeedsListResponseBody['results'][number] | null
  rssFeeds: RssFeedsListResponseBody
  hostnames: HostnameListResponse
}

// Kept as a plain (non-async) component: `TopicRouteLayout` resolves it as a JSX element rather
// than awaiting it directly, and only the outermost Server Component in that chain is awaited
// (by Next.js in production, and explicitly by tests) — a nested async component here would
// render as an unresolved promise instead of markup.
export function TopicRouteAsides({
  t,
  topicData,
  topicDisplayName,
  isAuthenticated,
  isMuted,
  firstRssFeed,
  rssFeeds,
  hostnames,
}: TopicRouteAsidesProps) {
  const topic = topicData.topic

  return (
    <>
      <TopicDescriptionAside
        t={t}
        html={topicData.html}
        topicName={topicDisplayName}
        contentUpdate={topicData.topic_content_update}
        contentLanguage={topic.lingua_rs_detected_language}
      />
      {firstRssFeed?.feed_type === 'podcast' && firstRssFeed.topic.id === topic.id && (
        <PodcastShowMetadataAside
          t={t}
          feed={firstRssFeed}
        />
      )}
      <ReferralCtaAside />
      <TopicSourcesAside
        t={t}
        rssFeeds={rssFeeds}
        hostnames={hostnames}
      />
      <TopicActionsAside
        topicId={topic.id}
        topicType={topic.topic_type}
        topicSlug={topic.slug}
        allowReviews={topic.allow_reviews}
        isMuted={isMuted}
      />
      <SequentialAsideSuspense>
        {topic.topic_type === 'rss_feed' && (
          <TopicPublisherTypesAside
            topic={topic}
            isAuthenticated={isAuthenticated}
          />
        )}
        <TopicCategoryTagsAside
          topic={topic}
          isAuthenticated={isAuthenticated}
        />
        <TopicRelatedTopicsAside topic={topic} />
        <TopicCommunitiesAside topic={topic} />
        <TopicFaqPostsAside topic={topic} />
        <TopicUrlTagAside
          topic={topic}
          isAuthenticated={isAuthenticated}
          predicate='landing_page'
          segment='landing_page'
          title={t('extracted.topics.topicRouteLayout.landingPage_a93cb7c7')}
        />
        <TopicUrlTagAside
          topic={topic}
          isAuthenticated={isAuthenticated}
          predicate='terms_of_service'
          segment='terms_of_service'
          title={t('extracted.topics.topicRouteLayout.termsOfService_4afa55bf')}
        />
        {(topic.topic_type === 'referral_program' || topic.referral_program_id !== null) && (
          <ReferralLinksAsideWrapper>
            <ReferralLinksAside topic={topic} />
          </ReferralLinksAsideWrapper>
        )}
      </SequentialAsideSuspense>
    </>
  )
}
