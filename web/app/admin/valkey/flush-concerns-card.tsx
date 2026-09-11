'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FLUSH_CONCERNS } from '@/types/api-responses'
import { FLUSH_CONCERN_METADATA, type PendingValkeyAction } from './valkey-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface FlushConcernsCardProps {
  flushLoading: Record<string, boolean>
  setPendingAction: (action: PendingValkeyAction) => void
}

export function FlushConcernsCard({ flushLoading, setPendingAction }: FlushConcernsCardProps) {
  const t = useTranslations()
  return (
    <Card className='mb-6'>
      <CardHeader>
        <CardTitle data-pw='flush-concerns-title'>
          {t('extracted.valkey.flushConcernsCard.flushConcerns_04cf5a8f')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-1 gap-4'>
          {FLUSH_CONCERNS.map(concern => (
            <div
              key={concern}
              className='flex items-center justify-between rounded-lg border p-4'
            >
              <div>
                <p className='text-sm font-medium text-foreground'>{concern}</p>
                <p className='text-sm text-muted-foreground'>
                  {FLUSH_CONCERN_METADATA[concern].description}
                </p>
              </div>
              <Button
                size='sm'
                variant={FLUSH_CONCERN_METADATA[concern].requiresForce ? 'destructive' : 'outline'}
                loading={flushLoading[concern]}
                disabled={flushLoading[concern]}
                onClick={() => setPendingAction({ type: 'flush', concern })}
              >
                {t('extracted.valkey.flushConcernsCard.flush_1278166f')}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
