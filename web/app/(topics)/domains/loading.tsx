import { DomainListSkeleton } from '@/components/domains/domain-list-skeleton'
import { PageWithAside } from '@/components/page-with-aside'

export default function Loading() {
  return (
    <PageWithAside showFooter={false}>
      <DomainListSkeleton />
    </PageWithAside>
  )
}
