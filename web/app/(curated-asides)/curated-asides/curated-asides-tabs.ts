import type { useTranslations } from '@/lib/i18n/use-translations'
import type { CuratedAsideType } from '@/types/api-responses/curated-aside-items'

export function getTabs(t: ReturnType<typeof useTranslations>) {
  return [
    {
      value: 'topic',
      label: t('extracted.curatedAsides.curatedAsidesClient.topics_1a2b3c4d'),
      href: '/curated-asides/topics',
    },
    {
      value: 'source',
      label: t('extracted.curatedAsides.curatedAsidesClient.sources_5e6f7a8b'),
      href: '/curated-asides/sources',
    },
    {
      value: 'community',
      label: t('extracted.curatedAsides.curatedAsidesClient.communities_9c0d1e2f'),
      href: '/curated-asides/communities',
    },
  ] as const satisfies Array<{
    value: CuratedAsideType
    label: string
    href: string
  }>
}
