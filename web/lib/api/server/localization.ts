import { cache } from 'react'
import type { LocalizationBatch } from '@vouchington/localization'
import { serverApi } from './instance'
import { WEB_LOCALIZATION_PATH, webLocalizationSearchParams } from '@/lib/i18n/localization-query'

export const getWebLocalizationBatch = cache((locale: string, selectors: string) => {
  return serverApi.get<LocalizationBatch>(WEB_LOCALIZATION_PATH, {
    searchParams: webLocalizationSearchParams(locale, selectors.split(',')),
  })
})
