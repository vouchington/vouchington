import { SourceListSkeleton } from '@/components/sources/source-list-skeleton'
import { PageWithAside } from '@/components/page-with-aside'

export default function Loading() {
  return (
    <PageWithAside>
      <SourceListSkeleton />
    </PageWithAside>
  )
}
