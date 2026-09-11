'use client'

import { useRouter } from 'next/navigation'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { BasicInfoSection } from './basic-info-section'
import { ImageSection } from './image-section'
import { useTopicEditPage } from './use-topic-edit-page'
import type { TopicEditState } from './topic-edit-model'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AboutClient({
  id,
  topicType,
  initialData,
}: {
  id: string
  topicType: string
  initialData: Partial<TopicEditState>
}) {
  const t = useTranslations()
  const router = useRouter()
  const mounted = useDidHydrate()
  const { handlers, state } = useTopicEditPage(id, topicType, router, initialData)

  if (state.loadError && !state.topic) {
    return (
      <div className='rounded-md bg-red-50 p-4'>
        <p className='text-sm text-red-800'>{state.loadError}</p>
      </div>
    )
  }

  if (!state.topic) return <div>{t('extracted.settings.aboutClient.topicNotFound_a53e8c70')}</div>

  return (
    <div
      data-pw='topic-settings-about'
      data-hydrated={mounted ? 'true' : 'false'}
      className='space-y-8'
    >
      <BasicInfoSection
        basicSaving={state.basicSaving}
        onBasicSubmit={handlers.handleBasicSubmit}
        topic={state.topic}
      />
      <ImageSection
        heroSaving={state.heroSaving}
        logoSaving={state.logoSaving}
        onHeroRemoved={handlers.handleHeroRemoved}
        onHeroUploaded={handlers.handleHeroUploaded}
        onLogoRemoved={handlers.handleLogoRemoved}
        onLogoUploaded={handlers.handleLogoUploaded}
        setHeroSaving={handlers.setHeroSaving}
        setLogoSaving={handlers.setLogoSaving}
        topic={state.topic}
      />
    </div>
  )
}
