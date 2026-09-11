import Link from 'next/link'
import type { Topic, TopicMetrics, TopicElection } from '@/types/topics'
import type { TopicDataPointInsights } from '@/types/topic-data-point-insights'
import { formatNumber, type NumberFormatLocale } from '@ts-shared/utils/format'
import type { Translator } from '@ts-shared/ui-messages'
import { CompareStatRow } from './compare-stat-row'
import { CompareDataInsights } from './compare-data-insights'
import { VoteCard } from './vote-card'
import { TopicLinks } from './topic-links'
import { computeRatingStats } from '@/lib/seo/topic-pages'

interface ComparePageProps {
  topicA: Topic
  topicB: Topic
  topicAPath: string
  topicBPath: string
  metricsA?: TopicMetrics
  metricsB?: TopicMetrics
  electionA?: TopicElection | null
  electionB?: TopicElection | null
  insightsA?: TopicDataPointInsights
  insightsB?: TopicDataPointInsights
  uiLocale: NumberFormatLocale
  t: Translator
}

export function ComparePage({
  topicA,
  topicB,
  topicAPath,
  topicBPath,
  metricsA,
  metricsB,
  electionA,
  electionB,
  insightsA,
  insightsB,
  uiLocale,
  t,
}: ComparePageProps) {
  const ratingsA = computeRatingStats(metricsA)
  const ratingsB = computeRatingStats(metricsB)

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-xl font-bold sm:text-2xl md:text-3xl'>
          <Link
            href={topicAPath}
            prefetch={false}
            className='hover:underline'
          >
            {topicA.name}
          </Link>{' '}
          {t('extracted.compare.comparePage.vs_f130559f')}{' '}
          <Link
            href={topicBPath}
            prefetch={false}
            className='hover:underline'
          >
            {topicB.name}
          </Link>
        </h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          {t('extracted.compare.comparePage.sideBySideComparisonBasedOn_4a4f0a3e')}
        </p>
      </div>

      <section className='space-y-3'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.compare.comparePage.communityVerdict_8413cee0')}
        </h2>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <VoteCard
            topic={topicA}
            election={electionA}
            t={t}
          />
          <VoteCard
            topic={topicB}
            election={electionB}
            t={t}
          />
        </div>
      </section>

      {(ratingsA.ratingCount > 0 || ratingsB.ratingCount > 0) && (
        <section className='space-y-3'>
          <h2 className='text-lg font-semibold'>
            {t('extracted.compare.comparePage.ratings_ff862693')}
          </h2>
          <div className='rounded-md border bg-card'>
            <CompareStatRow
              label={t('extracted.compare.comparePage.averageRating_66195d76')}
              valueA={formatRatingValue(ratingsA, uiLocale, t)}
              valueB={formatRatingValue(ratingsB, uiLocale, t)}
              topicAName={topicA.name}
              topicBName={topicB.name}
              t={t}
            />
            <CompareStatRow
              label={t('extracted.compare.comparePage.totalRatings_e3ae0f07')}
              valueA={formatNumber(ratingsA.ratingCount, uiLocale)}
              valueB={formatNumber(ratingsB.ratingCount, uiLocale)}
              topicAName={topicA.name}
              topicBName={topicB.name}
              t={t}
            />
          </div>
        </section>
      )}

      <section className='space-y-3'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.compare.comparePage.communityContent_2d345b61')}
        </h2>
        <div className='rounded-md border bg-card'>
          <CompareStatRow
            label={t('extracted.compare.comparePage.reviews_84cb7871')}
            valueA={formatNumber(metricsA?.count?.reviews ?? 0, uiLocale)}
            valueB={formatNumber(metricsB?.count?.reviews ?? 0, uiLocale)}
            topicAName={topicA.name}
            topicBName={topicB.name}
            t={t}
          />
          <CompareStatRow
            label={t('extracted.compare.comparePage.discussions_60157cfc')}
            valueA={formatNumber(metricsA?.count?.discussions ?? 0, uiLocale)}
            valueB={formatNumber(metricsB?.count?.discussions ?? 0, uiLocale)}
            topicAName={topicA.name}
            topicBName={topicB.name}
            t={t}
          />
          <CompareStatRow
            label={t('extracted.compare.comparePage.dataPoints_1da65e3a')}
            valueA={formatNumber(metricsA?.count?.['data-points'] ?? 0, uiLocale)}
            valueB={formatNumber(metricsB?.count?.['data-points'] ?? 0, uiLocale)}
            topicAName={topicA.name}
            topicBName={topicB.name}
            t={t}
          />
        </div>
      </section>

      {((insightsA?.total_count ?? 0) > 0 || (insightsB?.total_count ?? 0) > 0) && (
        <CompareDataInsights
          topicA={topicA}
          topicB={topicB}
          insightsA={insightsA}
          insightsB={insightsB}
          uiLocale={uiLocale}
          t={t}
        />
      )}

      <section className='space-y-3'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.compare.comparePage.exploreMore_838985f1')}
        </h2>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <TopicLinks
            topic={topicA}
            path={topicAPath}
            metrics={metricsA}
            t={t}
          />
          <TopicLinks
            topic={topicB}
            path={topicBPath}
            metrics={metricsB}
            t={t}
          />
        </div>
      </section>
    </div>
  )
}

function formatRatingValue(
  ratings: { ratingCount: number; ratingValue: number },
  locale: NumberFormatLocale,
  t: Translator,
): string {
  if (ratings.ratingCount <= 0) return t('extracted.compare.comparePage.nA_e2f79e5b')
  return t('extracted.compare.comparePage.value5_578059fa', {
    value: ratings.ratingValue.toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
  })
}
