/** A membership page can be empty and still name the next window. */
export function pageHasContinuation(pageInfo: {
  has_next_page: boolean
  end_cursor: string | null
}): boolean {
  return Boolean(pageInfo.has_next_page && pageInfo.end_cursor)
}
