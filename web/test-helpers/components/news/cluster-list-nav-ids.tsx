/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import { useRssItemNav } from '@/lib/rss-item-nav-context'

export function ClusterListNavIds() {
  const nav = useRssItemNav()
  return <div data-testid='nav-ids'>{nav?.orderedItemIds.join(',') ?? ''}</div>
}
