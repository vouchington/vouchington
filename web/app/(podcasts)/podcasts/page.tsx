export const dynamic = 'force-dynamic'

import { createPageMetadata } from '@/lib/seo/metadata'
import { BrowseFeedPage } from '@/components/sources/browse-feed-page'

export const metadata = createPageMetadata({
  title: 'Podcasts',
  description:
    'Browse podcast shows on Voucha — discover and listen to episodes across every category.',
  path: '/podcasts',
})

export default async function PodcastsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return BrowseFeedPage({
    searchParams,
    feedType: 'podcast',
    path: '/podcasts',
    title: 'Podcasts',
    collectionDescription: 'Browse podcast shows on Voucha.',
    listName: 'Podcasts',
    routeKey: 'podcasts',
    sourceKind: 'podcast',
    listTestId: 'podcasts-list',
    breadcrumb: { kind: 'message', key: 'extracted.podcasts.page.podcasts_1a2b3c4e' },
    emptyTitleKey: 'extracted.podcasts.page.noPodcastsFound_db2eb9ae',
    emptySearchKey: 'extracted.podcasts.page.noPodcastsMatchYourSearchTryAdjusting_2b3c4d5f',
    emptyDefaultKey: 'extracted.podcasts.page.noPodcastFeedsHaveBeenAddedYet_3c4d5e60',
    showFooter: false,
    includeHostnameElections: false,
    itemTitle: 'title',
  })
}
