import { useRssItemNav } from '@/lib/rss-item-nav-context'

export function ClusterListNavIds() {
  const nav = useRssItemNav()
  return <div data-pw='nav-ids'>{nav?.orderedItemIds.join(',') ?? ''}</div>
}
