import { UserPostsPage } from '@/components/users/user-posts-page'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export default async function UserPostsAllRoute({ params }: PageProps) {
  const { idOrUsername } = await params
  return <UserPostsPage idOrUsername={idOrUsername} />
}
