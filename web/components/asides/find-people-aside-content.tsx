'use client'

import { DismissibleCtaAside } from '@/components/asides/dismissible-cta-aside'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FindPeopleAsideContent({
  dismissKey = 'aside-find-people',
  'data-pw': dataPw = 'find-people-aside-content',
}: {
  dismissKey?: string
  'data-pw'?: string
}) {
  const t = useTranslations()
  return (
    <DismissibleCtaAside
      dismissKey={dismissKey}
      data-pw={dataPw}
      title={t('extracted.asides.findPeopleAsideContent.findPeopleToFollow_3257556c')}
      description={t(
        'extracted.asides.findPeopleAsideContent.followOtherMembersToSeeTheir_79b25a32',
      )}
      href='/users'
      actionLabel={t('extracted.asides.findPeopleAsideContent.discoverPeople_c6c9598e')}
      variant='outline'
    />
  )
}
