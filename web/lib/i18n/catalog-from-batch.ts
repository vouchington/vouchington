import type { EnCatalog } from '@ts-shared/ui-messages'
import { catalogTreeFromLeaves } from '@ts-shared/ui-messages/catalog-tree'
import type { LocalizationBatch } from '@vouchington/localization'

export function catalogFromLocalizationBatch(batch: LocalizationBatch): EnCatalog {
  return catalogTreeFromLeaves(batch.messages)
}
