'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CacheGroup } from '@/types/api-responses'
import type { PendingValkeyAction } from './valkey-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CacheManagementCardProps {
  cacheGroups: CacheGroup[]
  clearLoading: Record<string, boolean>
  setPendingAction: (action: PendingValkeyAction) => void
}

export function CacheManagementCard(props: CacheManagementCardProps) {
  const t = useTranslations()
  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle data-pw='cache-management-title'>
            {t('extracted.valkey.cacheManagementCard.cacheManagement_4c879c23')}
          </CardTitle>
          <Button
            size='sm'
            variant='destructive'
            loading={props.clearLoading['all']}
            disabled={props.clearLoading['all']}
            onClick={() => props.setPendingAction({ type: 'clearAll' })}
          >
            {props.clearLoading['all']
              ? t('extracted.valkey.cacheManagementCard.clearing_07a82437')
              : t('extracted.valkey.cacheManagementCard.clearAllCaches_870d571e')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          {props.cacheGroups.map(group => (
            <CacheGroupRow
              key={group.name}
              group={group}
              loading={!!props.clearLoading[group.name]}
              setPendingAction={props.setPendingAction}
            />
          ))}
          {props.cacheGroups.length === 0 && (
            <p className='text-muted-foreground'>
              {t('extracted.valkey.cacheManagementCard.noCacheGroupsFound_9346e100')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CacheGroupRow({
  group,
  loading,
  setPendingAction,
}: {
  group: CacheGroup
  loading: boolean
  setPendingAction: (action: PendingValkeyAction) => void
}) {
  const t = useTranslations()
  return (
    <div className='flex items-center justify-between rounded-lg border p-4'>
      <div>
        <span className='text-sm font-medium text-foreground'>{group.name}</span>
        <span className='ml-2 text-xs text-muted-foreground'>
          {group.prefixes.length} prefix{group.prefixes.length !== 1 ? 'es' : ''}
        </span>
      </div>
      <Button
        size='sm'
        variant='outline'
        loading={loading}
        disabled={loading}
        onClick={() => setPendingAction({ type: 'clear', target: group.name })}
      >
        {t('extracted.valkey.cacheManagementCard.clear_83b12c22')}
      </Button>
    </div>
  )
}
