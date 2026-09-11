'use client'

import { Copy, RefreshCw, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatReasonBreakdown } from './reports-clustered-format'
import type { AdminModerationReportDuplicateCluster } from './reports-client-types'

export function DuplicateClusterCard({
  duplicate,
  canRemove,
  disabled,
  loading,
  onRemove,
  uiLocale,
}: {
  duplicate: AdminModerationReportDuplicateCluster
  canRemove: boolean
  disabled: boolean
  loading: boolean
  onRemove: () => void
  uiLocale: string
}) {
  const t = useTranslations()
  return (
    <div className='rounded-md border border-destructive/30 bg-destructive/5 p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='destructive'>
              <Copy className='mr-1 size-3' />
              {duplicate.signal === 'content_hash_duplicate'
                ? t('extracted.admin.reportDuplicateClusterCard.contentDuplicate_c2f384e6')
                : t('extracted.admin.reportDuplicateClusterCard.embeddingMatch_766ba9b0')}
            </Badge>
            <span className='text-sm font-medium'>
              {t('shared.countLabel.format', { count: duplicate.post_count, unit: 'post' })}
            </span>
            <span className='text-sm text-muted-foreground'>
              {t('shared.countLabel.format', { count: duplicate.report_count, unit: 'report' })}
            </span>
          </div>
          <p className='text-sm text-muted-foreground'>
            {t('extracted.admin.reportDuplicateClusterCard.reasons_39086c62')}{' '}
            {formatReasonBreakdown(duplicate.reason_breakdown, uiLocale)}
          </p>
        </div>
        {canRemove ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size='touchSm'
                variant='destructive'
                disabled={disabled}
              >
                {loading ? (
                  <RefreshCw className='size-4 animate-spin' />
                ) : (
                  <Trash2 className='size-4' />
                )}
                {t('extracted.admin.reportDuplicateClusterCard.removeAll_ef7b7e6a')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('extracted.admin.reportDuplicateClusterCard.removeDuplicatePosts_ba96d750')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'extracted.admin.reportDuplicateClusterCard.thisRemovesCountlabelFromThisDuplicate_e5957ecd',
                    {
                      countLabel: t('shared.countLabel.format', {
                        count: duplicate.post_count,
                        unit: 'post',
                      }),
                    },
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={loading}>
                  {t('extracted.admin.reportDuplicateClusterCard.cancel_19766ed6')}
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={loading}
                  onClick={onRemove}
                >
                  {t('extracted.admin.reportDuplicateClusterCard.removePosts_7d288b5d')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  )
}
