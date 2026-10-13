'use client'

import { SourceFeedSections } from '@/components/topics/manage-source/source-feed-sections'
import { useManageSourcePage } from '@/components/topics/manage-source/use-manage-source-page'
import type { ManageSourceState } from '@/components/topics/manage-source/manage-source-model'

export function SourceClient({
  id,
  initialData,
}: {
  id: string
  initialData: Partial<ManageSourceState>
}) {
  const { handlers, state } = useManageSourcePage(id, initialData)

  if (state.loadError) {
    return (
      <div className='rounded-md bg-destructive/10 p-4'>
        <p className='text-sm text-destructive'>{state.loadError}</p>
      </div>
    )
  }

  return (
    <div
      data-pw='topic-settings-source'
      className='space-y-8'
    >
      <SourceFeedSections
        id={id}
        handlers={handlers}
        state={state}
      />
    </div>
  )
}
