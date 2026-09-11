'use client'

import type { MessageKey } from '@ts-shared/ui-messages'
import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useRouter } from 'next/navigation'

export interface RelationManagementActionConfig {
  entityType: string
  predicate: string
  activeLabel: MessageKey
  inactiveLabel: MessageKey
  errorLabel: MessageKey
}

export function RelationManagementAction({
  entityId,
  config,
  onRemoved,
}: {
  entityId: string
  config: RelationManagementActionConfig
  onRemoved?: (entityId: string) => void
}) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const handleRelationChange = (isActive: boolean) => {
    if (isActive) return
    onRemoved?.(entityId)
    refresh()
  }

  return (
    <EntityBookmarkButton
      entityType={config.entityType}
      entityId={entityId}
      predicate={config.predicate}
      activeLabel={t(config.activeLabel)}
      inactiveLabel={t(config.inactiveLabel)}
      errorLabel={t(config.errorLabel)}
      variant='outline'
      initialActive
      onChange={handleRelationChange}
      data-pw='relation-management-action'
    />
  )
}
