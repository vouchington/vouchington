import { catalogTreeForLocale } from '@ts-shared/ui-messages/load-catalog-json'

/** Direct normalized catalog loading for Vitest and non-Next component fixtures. */
export async function loadJsonMessages(locale: string) {
  const catalog = catalogTreeForLocale(locale)
  return catalog
}
