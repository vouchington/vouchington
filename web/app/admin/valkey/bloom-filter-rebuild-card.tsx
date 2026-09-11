'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BLOOM_FILTERS, type PendingValkeyAction } from './valkey-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface BloomFilterRebuildCardProps {
  rebuildLoading: Record<string, boolean>
  setPendingAction: (action: PendingValkeyAction) => void
}

export function BloomFilterRebuildCard({
  rebuildLoading,
  setPendingAction,
}: BloomFilterRebuildCardProps) {
  const t = useTranslations()
  return (
    <Card className='mb-6'>
      <CardHeader>
        <CardTitle data-pw='bloom-filter-rebuild-title'>
          {t('extracted.valkey.bloomFilterRebuildCard.bloomFilterRebuild_8ab6f07b')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
          {BLOOM_FILTERS.map(filter => (
            <div
              key={filter}
              className='flex items-center justify-between rounded-lg border p-4'
            >
              <span className='text-sm font-medium text-foreground'>{filter}</span>
              <Button
                size='sm'
                variant='outline'
                loading={rebuildLoading[filter]}
                disabled={rebuildLoading[filter]}
                onClick={() => setPendingAction({ type: 'rebuild', target: filter })}
              >
                {t('extracted.valkey.bloomFilterRebuildCard.rebuild_95aefb08')}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
