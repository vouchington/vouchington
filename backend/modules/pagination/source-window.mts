/**
 * Walk parents in inspection order. A full child window resumes that parent and
 * does not return later parents. A short child window continues. The API limit
 * caps returned rows; unreturned inspected rows stay behind the resume cursor.
 */
export function walkSourceWindow<TItem, TResult, TCursor>(args: {
  parents: readonly {
    items: readonly TItem[]
    openCursor: (item: TItem) => TCursor
    exhaustedCursor: TCursor
  }[]
  childLimit: number
  resultLimit: number
  parentHasMore: boolean
  accept: (item: TItem) => TResult | null
}): {
  results: TResult[]
  hasNextPage: boolean
  resume: TCursor | null
  start: TCursor | null
} {
  if (args.resultLimit <= 0) {
    return { results: [], hasNextPage: false, resume: null, start: null }
  }

  const results: TResult[] = []
  let resume: TCursor | null = null
  let start: TCursor | null = null
  let stopped = false
  let hasNextPage = false

  for (let parentIndex = 0; parentIndex < args.parents.length; parentIndex += 1) {
    const parent = args.parents[parentIndex]!
    const pageItems = parent.items.slice(0, args.childLimit)
    const childFull = parent.items.length > args.childLimit
    const moreParents = parentIndex < args.parents.length - 1 || args.parentHasMore

    if (pageItems.length === 0) {
      resume = parent.exhaustedCursor
      continue
    }

    for (let itemIndex = 0; itemIndex < pageItems.length; itemIndex += 1) {
      const item = pageItems[itemIndex]!
      const accepted = args.accept(item)
      const moreAfter = itemIndex < pageItems.length - 1 || childFull || moreParents
      if (accepted) {
        if (!start) start = parent.openCursor(item)
        results.push(accepted)
      }
      resume = parent.openCursor(item)
      if (results.length >= args.resultLimit && moreAfter) {
        hasNextPage = true
        stopped = true
        break
      }
      if (results.length >= args.resultLimit && !moreAfter) {
        hasNextPage = false
        resume = null
        stopped = true
        break
      }
    }
    if (stopped) break
    if (childFull) {
      hasNextPage = true
      stopped = true
      break
    }
    resume = parent.exhaustedCursor
  }

  if (!stopped) {
    hasNextPage = args.parentHasMore
    if (!hasNextPage) resume = null
  }

  return { results, hasNextPage, resume, start }
}
