import { EmptyState } from '@/components/shared/empty-state'
import { HostnameListItem } from '@/components/domains/hostname-list-item'
import type { Hostname } from '@/types/hostnames'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from './relation-management-action'

export function UserHostnameRelationList({
  hostnames,
  emptyTitle,
  emptyDescription,
  relationAction,
}: {
  hostnames: Hostname[]
  emptyTitle: string
  emptyDescription: string
  relationAction?: RelationManagementActionConfig
}) {
  if (hostnames.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className='space-y-4'>
      {hostnames.map(hostname => (
        <div key={hostname.id}>
          <HostnameListItem hostname={hostname} />
          {relationAction ? (
            <div className='mt-2'>
              <RelationManagementAction
                entityId={hostname.id}
                config={relationAction}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
