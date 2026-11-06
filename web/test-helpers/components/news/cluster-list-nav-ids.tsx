import { configure } from '@testing-library/react'
import { useRssItemNav } from '@/lib/rss-item-nav-context'

configure({ testIdAttribute: 'data-pw' })

export function ClusterListNavIds() {
  const nav = useRssItemNav()
  return <div data-pw='nav-ids'>{nav?.orderedItemIds.join(',') ?? ''}</div>
}
