import type { Metadata } from 'next'
import Link from 'next/link'
import { MediaItemListingPage } from '@/components/feed/media-item-listing-page'
import { AddSourceButton } from '@/components/sources/add-source-button'
import { Button } from '@/components/ui/button'
import { getEffectiveServerFeatureFlag } from '@/lib/feature-flags/server'
import { createPageMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = createPageMetadata({
  title: 'Videos',
  description: 'Latest videos from the channels you follow.',
  path: '/videos',
})

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return MediaItemListingPage({
    searchParams,
    mediaType: 'video',
    path: '/videos',
    title: 'Videos',
    description: 'Latest videos from the channels you follow.',
    routeKey: 'videos',
    headerActions: async () => {
      const fediverseEnabled = await getEffectiveServerFeatureFlag('fediverse')
      return (
        <div className='flex flex-wrap gap-2'>
          {fediverseEnabled ? (
            <Button
              asChild
              variant='outline'
            >
              <Link href='/fediverse?provider=peertube'>Search PeerTube</Link>
            </Button>
          ) : null}
          <AddSourceButton kind='video' />
        </div>
      )
    },
  })
}
