import { AsideSkeleton } from '@/components/asides/aside-skeleton'
import { NewsListSkeleton } from '@/components/news/news-list-skeleton'
import { PageWithAside } from '@/components/page-with-aside'

export default function Loading() {
  return (
    <PageWithAside aside={AsideSkeleton}>
      <NewsListSkeleton />
    </PageWithAside>
  )
}
