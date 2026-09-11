import { AsideSkeleton } from '@/components/asides/aside-skeleton'
import { TopicListSkeleton } from '@/components/topics/topic-list-skeleton'
import { PageWithAside } from '@/components/page-with-aside'

export default function Loading() {
  return (
    <PageWithAside aside={AsideSkeleton}>
      <TopicListSkeleton />
    </PageWithAside>
  )
}
