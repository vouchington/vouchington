import type { PageInfo } from '@/types/api-responses/shared'

export interface ReferenceListResponseBody<TResult> {
  results: TResult[]
  page_info: PageInfo
}
