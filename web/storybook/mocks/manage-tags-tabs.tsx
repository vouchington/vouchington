'use client'

import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { ManageTagsCard } from '@/components/tags/manage-tags-card'
import { ManageTagsContent } from '@/components/tags/manage-tags-content'
import type { TagRelationTab } from '@/components/tags/tag-relation-configs'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'

interface ManageTagsTabsProps {
  entityType: string
  entityId: string
  tabs: readonly TagRelationTab[]
  activeTab: string
}

const emptyRelations: Promise<EntityRelationsResponse> = Promise.resolve({
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  entity_relations: {},
})

export function ManageTagsTabs({ entityType, entityId, tabs, activeTab }: ManageTagsTabsProps) {
  const t = useTranslations()
  const activeTabConfig = tabs.find(tab => tab.value === activeTab) ?? tabs[0]!
  const heading = t(activeTabConfig.label)
  return (
    <div className='space-y-4'>
      <ManageTagsCard heading={heading}>
        <ErrorBoundary
          fallback={<div className='text-sm text-destructive'>Error loading tags</div>}
        >
          <Suspense fallback={<div className='text-sm text-muted-foreground'>Loading...</div>}>
            <ManageTagsContent
              entityType={entityType}
              entityId={entityId}
              predicate={activeTabConfig.predicate}
              objectType={activeTabConfig.objectType}
              label={heading}
              relationsPromise={emptyRelations}
              isAuthenticated
            />
          </Suspense>
        </ErrorBoundary>
      </ManageTagsCard>
    </div>
  )
}
