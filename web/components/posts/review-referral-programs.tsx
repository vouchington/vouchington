import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { topicHref } from '@/lib/links/entity-href'
import type { getTranslations } from '@/lib/i18n/get-translations'
import type { Post } from '@/types/posts'

interface ReviewReferralProgramsProps {
  t: Awaited<ReturnType<typeof getTranslations>>
  post: Post
}

export function ReviewReferralPrograms({ t, post }: ReviewReferralProgramsProps) {
  if (post.post_type !== 'review') return null
  const ReferralLinkIcon = EntityActionIcons.referralLink

  const ratings = post.review_topic_ratings ?? []

  // Collect unique referral program entries from rated topics
  const seen = new Set<string>()
  const referralTopics: Array<{
    topicId: string
    topicSlug: string | null
    topicType: string
    topicName: string
  }> = []

  for (const r of ratings) {
    const topic = r.topic
    if (!topic) continue

    if (topic.topic_type === 'referral_program') {
      if (!seen.has(topic.id)) {
        seen.add(topic.id)
        referralTopics.push({
          topicId: topic.id,
          topicSlug: topic.slug,
          topicType: topic.topic_type,
          topicName: topic.name,
        })
      }
    } else if (topic.referral_program_id) {
      if (!seen.has(topic.referral_program_id)) {
        seen.add(topic.referral_program_id)
        referralTopics.push({
          topicId: topic.referral_program_id,
          topicSlug: topic.referral_program_slug ?? null,
          topicType: 'referral_program',
          topicName: topic.name,
        })
      }
    }
  }

  if (referralTopics.length === 0) return null

  return (
    <Card className='p-4'>
      <h3
        className='mb-2 flex items-center gap-2 text-sm font-semibold'
        data-pw='review-referral-links-heading'
      >
        <ReferralLinkIcon className='h-4 w-4' />
        {t('extracted.posts.reviewReferralPrograms.referralLinks_4348d2ad')}
      </h3>
      <p className='mb-3 text-xs text-muted-foreground'>
        {t('extracted.posts.reviewReferralPrograms.supportTheReviewerUseTheirReferral_6914a773')}
      </p>
      <div className='flex flex-wrap gap-2'>
        {referralTopics.map(topic => (
          <Link
            key={topic.topicId}
            href={topicHref(
              { topic_type: topic.topicType, id: topic.topicId, slug: topic.topicSlug },
              'referral-links',
            )}
            prefetch={false}
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
            data-pw={`review-referral-link-${topic.topicId}`}
          >
            <Badge
              variant='secondary'
              className='text-xs'
            >
              {t('extracted.posts.reviewReferralPrograms.topicnameReferralLinks_ba43b90b', {
                topicName: topic.topicName,
              })}
            </Badge>
          </Link>
        ))}
      </div>
    </Card>
  )
}
