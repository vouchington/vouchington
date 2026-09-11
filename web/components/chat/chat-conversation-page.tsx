import type { ReactNode } from 'react'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'
import { PopularCommunitiesAside } from '@/components/asides/popular-communities-aside'
import { PageWithAside } from '@/components/page-with-aside'

function ChatAside() {
  return (
    <SequentialAsideSuspense>
      <PopularCommunitiesAside />
    </SequentialAsideSuspense>
  )
}

export function ChatConversationPage({ children }: { children: ReactNode }) {
  return (
    <PageWithAside
      showFooter={false}
      mobileHidden
      aside={ChatAside}
    >
      {/* Height = viewport minus navbar (3rem) minus main padding (py-2=1rem mobile, p-4=2rem sm+) */}
      <div className='flex h-[calc(100svh-4rem)] flex-col sm:h-[calc(100svh-5rem)]'>{children}</div>
    </PageWithAside>
  )
}
