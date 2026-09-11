import type { ListResponse } from '@/types/api-responses'
import type { PointValuation } from '@/types/my'

export type PointValuationPageInput =
  | ListResponse<PointValuation>
  | { results: PointValuation[]; page_info?: undefined }

export function normalizePointValuationPage(
  page: PointValuationPageInput,
): ListResponse<PointValuation> {
  return page.page_info
    ? page
    : {
        results: page.results,
        page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      }
}

export function mergePointValuationPages(
  pages: Array<ListResponse<PointValuation>>,
  upserts: Map<string, PointValuation>,
  deletedIds: Set<string>,
): PointValuation[] {
  const valuations = new Map<string, PointValuation>()
  for (const page of pages) {
    for (const valuation of page.results) valuations.set(valuation.id, valuation)
  }
  for (const [id, valuation] of upserts) valuations.set(id, valuation)
  for (const id of deletedIds) valuations.delete(id)
  return [...valuations.values()].toSorted((left, right) => left.id.localeCompare(right.id))
}
