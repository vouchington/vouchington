import { UserViewedRssFeedRoute } from '@/components/users/user-relation-route-pages'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export default async function UserViewedRssFeedsPage({ params }: PageProps) {
  const { idOrUsername } = await params
  return (
    <UserViewedRssFeedRoute
      idOrUsername={idOrUsername}
      emptyTitle='No recently viewed feeds'
      emptyDescription='There are no recently viewed feeds to show.'
    />
  )
}
