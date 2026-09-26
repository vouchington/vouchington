import type { ReactNode } from 'react'
import { PostsDiscoveryAside } from '@/components/asides/posts-discovery-aside'
import { PageWithAside } from '@/components/page-with-aside'

export function EditPostPageBody({
  title,
  officialGateMessage,
  children,
}: {
  title: string
  officialGateMessage: string | null
  children?: ReactNode
}) {
  return (
    <PageWithAside
      aside={PostsDiscoveryAside}
      showFooter={false}
    >
      <div className='max-w-2xl space-y-4'>
        <h1
          className='text-2xl font-bold'
          data-pw='edit-post-page-heading'
        >
          {title}
        </h1>
        {officialGateMessage != null ? (
          <p
            className='text-sm text-muted-foreground'
            data-pw='official-account-edit-post-gate'
          >
            {officialGateMessage}
          </p>
        ) : (
          children
        )}
      </div>
    </PageWithAside>
  )
}
