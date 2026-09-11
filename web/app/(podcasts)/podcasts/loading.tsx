import { PodcastListSkeleton } from '@/components/podcasts/podcast-list-skeleton'
import { PageWithAside } from '@/components/page-with-aside'

export default function Loading() {
  return (
    <PageWithAside showFooter={false}>
      <PodcastListSkeleton />
    </PageWithAside>
  )
}
