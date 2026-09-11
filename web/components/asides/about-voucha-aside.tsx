'use client'

import { AsideAccordion } from './aside-accordion'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AboutVouchaAside() {
  const t = useTranslations()
  return (
    <AsideAccordion
      title={t('extracted.asides.aboutVouchaAside.aboutVoucha_693dc277')}
      defaultOpen
      data-pw='aside-accordion-about-voucha'
    >
      <p className='text-xs text-muted-foreground'>
        {t('extracted.asides.aboutVouchaAside.realDataFromRealPeopleBrowse_94b6ed2c')}
      </p>
    </AsideAccordion>
  )
}
