import { webSelectorsForPath } from './localization-selectors'

export const WEB_LOCALIZATION_PATH = '/api/v1/localization'

export function webLocalizationSearchParams(
  locale: string,
  selectors: readonly string[] = webSelectorsForPath(''),
) {
  const locales = locale === 'es' || locale === 'fr' || locale === 'pt' ? locale : 'en'
  return {
    consumer: 'web',
    locales,
    selectors: selectors.join(','),
  }
}
