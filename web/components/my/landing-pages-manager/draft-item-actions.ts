import type { LandingPageItem } from '@/types/landing-pages'

export function moveDraftItem(
  draftItems: LandingPageItem[],
  index: number,
  direction: -1 | 1,
): LandingPageItem[] {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= draftItems.length) return draftItems
  const next = [...draftItems]
  const item = next.splice(index, 1)[0]!
  next.splice(nextIndex, 0, item)
  return next
}

export function moveDraftGroupEntry(
  draftItems: LandingPageItem[],
  itemIndex: number,
  entryIndex: number,
  direction: -1 | 1,
): LandingPageItem[] {
  return draftItems.map((item, index) => {
    if (index !== itemIndex || item.type !== 'topic_group') return item
    const nextEntries = [...item.entries]
    const targetIndex = entryIndex + direction
    if (targetIndex < 0 || targetIndex >= nextEntries.length) return item
    const entry = nextEntries.splice(entryIndex, 1)[0]!
    nextEntries.splice(targetIndex, 0, entry)
    return { ...item, entries: nextEntries }
  })
}

export function removeDraftGroupEntry(
  draftItems: LandingPageItem[],
  itemIndex: number,
  entryIndex: number,
): LandingPageItem[] {
  return draftItems.flatMap((item, index) => {
    if (index !== itemIndex || item.type !== 'topic_group') return [item]
    const nextEntries = item.entries.filter((_, idx) => idx !== entryIndex)
    return nextEntries.length > 0 ? [{ ...item, entries: nextEntries }] : []
  })
}
