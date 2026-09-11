import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { communityHref } from '@/lib/links/entity-href'
import type { Topic } from '@/types/topics'
import type { Community, CommunityMetrics } from '@/types/api-responses'
import type { useTranslations } from '@/lib/i18n/use-translations'

interface TopicCommunitiesAsideContentProps {
  topic: Topic
  communities: Community[]
  communityMetrics: Record<string, CommunityMetrics>
  t: ReturnType<typeof useTranslations>
}

export function TopicCommunitiesAsideContent({
  topic,
  communities,
  communityMetrics,
  t,
}: TopicCommunitiesAsideContentProps) {
  if (communities.length === 0) return null

  return (
    <Card
      className='p-4'
      data-pw='topic-communities-aside'
    >
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>
          {t('extracted.topics.topicCommunitiesAsideContent.communitiesAboutThisTopic_cc0f36b8')}
        </h3>
        <Button
          asChild
          variant='ghost'
          size='sm'
        >
          <Link
            prefetch={false}
            href={`/communities?q=%23${topic.slug}`}
            data-pw='topic-communities-aside-see-all'
          >
            {t('extracted.topics.topicCommunitiesAsideContent.seeAll_d7a8c446')}
          </Link>
        </Button>
      </div>
      <ul className='space-y-2'>
        {communities.map(community => {
          const metrics = communityMetrics?.[community.id]
          return (
            <li key={community.id}>
              <Link
                prefetch={false}
                href={communityHref(community)}
                className='flex items-center justify-between gap-2 text-sm hover:underline'
              >
                <span className='truncate font-medium'>{community.name}</span>
                {metrics && (
                  <span className='shrink-0 text-muted-foreground'>
                    {t('shared.countLabel.format', { count: metrics.member_count, unit: 'member' })}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
