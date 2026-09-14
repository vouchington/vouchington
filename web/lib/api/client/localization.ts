'use client'

import type { LocalizationBatch } from '@vouchington/localization'
import { clientApi } from './instance'
import { WEB_LOCALIZATION_PATH, webLocalizationSearchParams } from '@/lib/i18n/localization-query'

export function getWebLocalizationBatchClient(
  locale: string,
  selectors: readonly string[],
): Promise<LocalizationBatch> {
  return clientApi.get<LocalizationBatch>(WEB_LOCALIZATION_PATH, {
    searchParams: webLocalizationSearchParams(locale, selectors),
  })
}
