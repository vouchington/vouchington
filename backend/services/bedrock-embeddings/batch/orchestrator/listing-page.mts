export type BatchListingCursor = { afterId: string; throughId: string }

export type BatchListingPage<T> = {
  batches: T[]
  hasMore: boolean
  nextCursor?: BatchListingCursor
}

export function toBatchListingPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  throughId: string,
): BatchListingPage<T> {
  const batches = rows.slice(0, limit)
  const hasMore = rows.length > limit
  return {
    batches,
    hasMore,
    ...(hasMore && { nextCursor: { afterId: batches.at(-1)!.id, throughId } }),
  }
}
