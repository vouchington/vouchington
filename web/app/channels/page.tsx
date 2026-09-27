export const dynamic = 'force-dynamic'

import { createPageMetadata } from '@/lib/seo/metadata'
import { BrowseFeedPage } from '@/components/sources/browse-feed-page'

export const metadata = createPageMetadata({
  title: 'Channels',
  description: 'Discover video channels on Voucha.',
  path: '/channels',
})

export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return BrowseFeedPage({
    searchParams,
    feedType: 'video',
    path: '/channels',
    title: 'Channels',
    collectionDescription: 'Discover video channels on Voucha.',
    listName: 'Channels',
    routeKey: 'channels',
    sourceKind: 'video',
    listTestId: 'channels-list',
    breadcrumb: { kind: 'literal', name: 'Channels' },
    emptyTitleKey: 'extracted.channels.page.noChannelsFound_86350898',
    emptySearchKey: 'extracted.channels.page.noChannelsMatchYourSearchTry_c640eb88',
    emptyDefaultKey: 'extracted.channels.page.noVideoChannelsHaveBeenAdded_19eb06b1',
    showFooter: true,
    includeHostnameElections: true,
    itemTitle: 'title-or-topic',
  })
}
