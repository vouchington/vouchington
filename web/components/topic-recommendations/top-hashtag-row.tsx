import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { TopHashtag, TopHashtagsResponseBody } from '@/lib/api/client/topic-recommendations'
import { useTranslations } from '@/lib/i18n/use-translations'
import { topicHref } from '@/lib/links/entity-href'
import { getTopicDisplayName } from '@/lib/topics/display-name'
import { normalizeHashtag } from '@ts-shared/utils'

type LinkedTopic = TopHashtagsResponseBody['topics'][string]

export function TopHashtagRow({
  isAdmin,
  item,
  linkedTopic,
  onStartLink,
  onUnlink,
}: {
  isAdmin: boolean
  item: TopHashtag
  linkedTopic: LinkedTopic | undefined
  onStartLink: () => void
  onUnlink: (item: TopHashtag) => void
}) {
  const t = useTranslations()
  return (
    <li className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-3'>
      <div>
        <p className='font-medium'>#{item.hashtag.replace(/^#/, '')}</p>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.topicRecommendations.topHashtags.itemsContributors_4b364edd', {
            items: item.item_count,
            contributors: item.contributor_count,
          })}
        </p>
      </div>
      {linkedTopic || isAdmin ? (
        <div className='flex items-center gap-2'>
          {linkedTopic ? (
            <Link
              href={topicHref(linkedTopic)}
              className='text-sm underline hover:no-underline'
            >
              {getTopicDisplayName(linkedTopic)}
            </Link>
          ) : null}
          {isAdmin ? (
            item.topic_id ? (
              normalizeHashtag(item.hashtag)?.key !== linkedTopic?.slug ? (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => onUnlink(item)}
                >
                  {t('extracted.topicRecommendations.topHashtags.unlink_b90108da')}
                </Button>
              ) : null
            ) : (
              <>
                <Button
                  type='button'
                  variant='outline'
                  onClick={onStartLink}
                >
                  {t('extracted.topicRecommendations.topHashtags.linkTopic_4d3e8c3d')}
                </Button>
                <Button asChild>
                  <Link href={topicCreationHref(item)}>
                    {t('extracted.topicRecommendations.topHashtags.createTopic_15c75a49')}
                  </Link>
                </Button>
              </>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function topicCreationHref(item: TopHashtag) {
  const normalized = normalizeHashtag(item.hashtag)
  if (!normalized) throw new Error('Invalid hashtag')
  const name = normalized.authored.replace(/^#/, '')
  const params = new URLSearchParams({
    name,
    slug: normalized.key,
    source_topic_alias_id: item.topic_alias_id,
  })
  return `/topics/create?${params}`
}
