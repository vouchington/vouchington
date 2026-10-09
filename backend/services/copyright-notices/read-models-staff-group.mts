/** Groups a batched read by notice, keeping SQL row order and dropping the grouping key. */
export function groupByNotice<T extends { copyright_notice_id: string }>(
  rows: readonly T[],
): Map<string, Array<Omit<T, 'copyright_notice_id'>>> {
  const grouped = new Map<string, Array<Omit<T, 'copyright_notice_id'>>>()
  for (const { copyright_notice_id: noticeId, ...rest } of rows) {
    const group = grouped.get(noticeId)
    if (group) group.push(rest)
    else grouped.set(noticeId, [rest])
  }
  return grouped
}
