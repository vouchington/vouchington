export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { NewsPreferencesForm } from '@/components/my/news-preferences-form'
import { SettingsPageHeader } from '@/components/my/settings-page-header'

export const metadata: Metadata = createNoIndexMetadata('News Preferences')
import { getTopics } from '@/lib/api/server/topics'
import { PUBLISHER_TYPE_SLUGS } from '@/lib/publisher-types'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function NewsPreferencesPage() {
  const t = await getTranslations()
  const publisherTypesResponse = await getTopics({
    searchParams: {
      slugs: PUBLISHER_TYPE_SLUGS.join(','),
      limit: PUBLISHER_TYPE_SLUGS.length,
    },
  })
  const publisherTypesBySlug = new Map(
    Object.values(publisherTypesResponse?.topics ?? {}).map(topic => [topic.slug, topic]),
  )
  const publisherTypes = PUBLISHER_TYPE_SLUGS.flatMap(slug => {
    const topic = publisherTypesBySlug.get(slug)
    return topic ? [topic] : []
  })

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.newsPreferences.page.newsPreferences_fa644b2b')}
        description={t(
          'extracted.newsPreferences.page.controlWhichTypesOfPublishersAppear_15573e13',
        )}
      />
      <NewsPreferencesForm publisherTypes={publisherTypes} />
    </div>
  )
}
