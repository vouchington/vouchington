export const dynamic = 'force-dynamic'

import { createPageMetadata } from '@/lib/seo/metadata'
import { BrowseFeedPage } from '@/components/sources/browse-feed-page'

export const metadata = createPageMetadata({
  title: 'News Sources',
  description: 'Discover news sources and RSS feeds on Voucha.',
  path: '/news-sources',
})

export default async function NewsSourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return BrowseFeedPage({
    searchParams,
    feedType: 'article',
    path: '/news-sources',
    title: 'News Sources',
    collectionDescription: 'Discover news sources and RSS feeds on Voucha.',
    listName: 'News Sources',
    routeKey: 'news-sources',
    sourceKind: 'news',
    listTestId: 'news-sources-list',
    breadcrumb: { kind: 'literal', name: 'News Sources' },
    emptyTitleKey: 'extracted.newsSources.page.noNewsSourcesFound_21938829',
    emptySearchKey: 'extracted.newsSources.page.noNewsSourcesMatchYourSearch_d354bc36',
    emptyDefaultKey: 'extracted.newsSources.page.noNewsSourcesHaveBeenAdded_f3ce03b4',
    showFooter: true,
    includeHostnameElections: true,
    itemTitle: 'title-or-topic',
  })
}
