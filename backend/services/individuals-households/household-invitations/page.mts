import { buildPageInfo } from '@modules/pagination'

export function page<T extends { id: string }>(rows: T[], limit: number) {
  const results = rows.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: rows.length > limit,
      getCursor: item => ({ id: item.id }),
    }),
  }
}
