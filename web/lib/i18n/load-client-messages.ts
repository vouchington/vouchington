import type { EnCatalog } from '@ts-shared/ui-messages'
import { catalogFromLocalizationBatch } from './catalog-from-batch'
import { webSelectorsForPath } from './localization-selectors'

/** Browser catalog load for locale switches and route transitions; SSR receives its backend catalog from the hydrator. */
export async function loadClientMessages(locale: string, pathname?: string): Promise<EnCatalog> {
  if (typeof window === 'undefined') {
    throw new TypeError('Client messages must be seeded from the backend SSR catalog')
  }
  const currentPathname = pathname ?? window.location.pathname
  const { getWebLocalizationBatchClient } = await import('@/lib/api/client/localization')
  return catalogFromLocalizationBatch(
    await getWebLocalizationBatchClient(locale, webSelectorsForPath(currentPathname)),
  )
}
