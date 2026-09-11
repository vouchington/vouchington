import { AsideSkeleton } from '@/components/asides/aside-skeleton'
import { PostListSkeleton } from '@/components/posts/post-list-skeleton'
import { PageWithAside } from '@/components/page-with-aside'

export default function Loading() {
  return (
    <PageWithAside aside={AsideSkeleton}>
      <PostListSkeleton />
    </PageWithAside>
  )
}
