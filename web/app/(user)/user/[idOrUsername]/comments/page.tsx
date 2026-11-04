import { UserPostsPage } from '@/components/users/user-posts-page'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

interface PageProps {
  params: Promise<{ idOrUsername: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function UserCommentsPageRoute({ params, searchParams }: PageProps) {
  const { idOrUsername } = await params
  const { time_range } = await searchParams

  return (
    <UserPostsPage
      idOrUsername={idOrUsername}
      timeRange={time_range}
      postTypes='comment'
    />
  )
}
