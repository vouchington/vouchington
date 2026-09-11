import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
import { domainHref, urlHref } from '@/lib/links/entity-href'
import type { PublicUrl } from '@/types/api-responses'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from './relation-management-action'

export function UserUrlRelationList({
  urls,
  emptyTitle,
  emptyDescription,
  relationAction,
}: {
  urls: PublicUrl[]
  emptyTitle: string
  emptyDescription: string
  relationAction?: RelationManagementActionConfig
}) {
  if (urls.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className='space-y-4'>
      {urls.map(url => (
        <Card
          key={url.id}
          className='space-y-3 p-4'
        >
          <Link
            href={urlHref(url)}
            className='break-words font-medium hover:underline'
            prefetch={false}
          >
            {url.url}
          </Link>
          {url.hostname ? (
            <Link
              href={domainHref(url.hostname)}
              className='block text-sm text-muted-foreground hover:underline'
              prefetch={false}
            >
              {url.hostname.hostname}
            </Link>
          ) : null}
          {relationAction ? (
            <RelationManagementAction
              entityId={url.id}
              config={relationAction}
            />
          ) : null}
        </Card>
      ))}
    </div>
  )
}
