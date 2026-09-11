import Link from 'next/link'
import type { PublicLandingPage } from '@/types/landing-pages'
import { PostContentText } from '@/components/posts/post-content-text'
import { getReviewHref } from './public-landing-page-routes'
import type { getTranslations } from '@/lib/i18n/get-translations'

type PublicLandingPageItem = PublicLandingPage['landing_page']['items'][number]
type TopicGroupItem = Extract<PublicLandingPageItem, { type: 'topic_group' }>
type Translate = Awaited<ReturnType<typeof getTranslations>>

export function PublicLandingPageTopicGroup({ item, t }: { item: TopicGroupItem; t: Translate }) {
  return (
    <section className='rounded-2xl border border-border bg-background p-6 shadow-sm'>
      <div className='mb-4'>
        <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
          {t('extracted.landingPages.publicLandingPageTopicGroup.topicGroup_dfa81373')}
        </p>
        <h2
          data-pw='landing-page-topic-group-name'
          className='text-xl font-semibold'
        >
          {item.topic.name}
        </h2>
      </div>
      <div className='space-y-3'>
        {item.entries.map(entry =>
          entry.type === 'review' ? (
            <TopicGroupReviewEntry
              key={entry.id}
              entry={entry}
              item={item}
              t={t}
            />
          ) : (
            <TopicGroupReferralEntry
              key={entry.id}
              entry={entry}
              itemId={item.id}
              t={t}
            />
          ),
        )}
      </div>
    </section>
  )
}

function TopicGroupReviewEntry({
  entry,
  item,
  t,
}: {
  entry: Extract<TopicGroupItem['entries'][number], { type: 'review' }>
  item: TopicGroupItem
  t: Translate
}) {
  const primaryTopic = entry.review.review_topic_ratings.find(
    reviewTopic => reviewTopic.topic_id === item.topic.id,
  )
  return (
    <Link
      href={getReviewHref(entry.review.slug, entry.review.id)}
      prefetch={false}
      data-item-id={item.id}
      data-group-member-id={entry.id}
      className='flex min-h-11 items-center rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent'
    >
      <div className='space-y-1'>
        <PostContentText
          as='p'
          content={{
            text: entry.review.title,
            declared_language: entry.review.declared_language,
            lingua_rs_detected_language: entry.review.lingua_rs_detected_language,
          }}
          fallback={t('extracted.landingPages.publicLandingPageTopicGroup.review_aff0766a')}
          className='text-sm font-medium'
        />
        {primaryTopic ? (
          <p className='text-xs text-muted-foreground'>
            {t('extracted.landingPages.publicLandingPageTopicGroup.ratingRating5_c55d8d4e', {
              rating: primaryTopic.rating,
            })}
          </p>
        ) : null}
      </div>
    </Link>
  )
}

function TopicGroupReferralEntry({
  entry,
  itemId,
  t,
}: {
  entry: Extract<TopicGroupItem['entries'][number], { type: 'referral_link' }>
  itemId: string
  t: Translate
}) {
  return (
    <a
      href={entry.referral_link.url}
      target='_blank'
      rel='nofollow noopener noreferrer'
      data-item-id={itemId}
      data-group-member-id={entry.id}
      className='flex min-h-11 items-center rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent'
    >
      <p className='text-sm font-medium'>
        {entry.referral_link.label ||
          t('extracted.landingPages.publicLandingPageTopicGroup.referralLink_441c6d0e')}
      </p>
    </a>
  )
}
