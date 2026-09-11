'use client'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { useDataRequest } from './use-data-request'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  userId: string
}

export function DataRequestSection({ userId }: Props) {
  const t = useTranslations()
  const now = useNow()
  const { request, loading, requesting, error, handleRequest } = useDataRequest(userId)

  const expiresIn =
    request?.expires_at && now !== null
      ? Math.ceil((new Date(request.expires_at).getTime() - now) / (1000 * 60 * 60 * 24))
      : null

  return (
    <div className='space-y-3'>
      <div>
        <h3
          className='text-base font-medium'
          data-pw='data-export-section-heading'
        >
          {t('extracted.data.dataRequestSection.dataExport_bdcea052')}
        </h3>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.data.dataRequestSection.downloadACopyOfAllYour_9fa3612f')}
        </p>
      </div>

      {loading ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.data.dataRequestSection.loading_ba3bbbe1')}
        </p>
      ) : (
        <>
          {request?.status === 'ready' && now === null ? (
            <p className='text-sm text-muted-foreground'>
              {t('extracted.data.dataRequestSection.loading_ba3bbbe1')}
            </p>
          ) : request?.status === 'pending' || request?.status === 'processing' ? (
            <p className='text-sm text-muted-foreground'>
              {t('extracted.data.dataRequestSection.yourExportIsBeingPreparedThis_3deb13ca')}
            </p>
          ) : request?.status === 'ready' && expiresIn && expiresIn > 0 && request.download_url ? (
            <div className='flex items-center gap-3'>
              <a
                href={request.download_url}
                download='export.zip'
                className='text-sm underline'
              >
                {t('extracted.data.dataRequestSection.downloadExport_0e113d10')}
              </a>
              <span className='text-sm text-muted-foreground'>
                Expires in {expiresIn} day{expiresIn !== 1 ? 's' : ''}
              </span>
            </div>
          ) : request?.status === 'expired' ||
            (request?.status === 'ready' && expiresIn != null && expiresIn <= 0) ? (
            <div className='space-y-2'>
              <p className='text-sm text-muted-foreground'>
                {t('extracted.data.dataRequestSection.yourPreviousExportExpiredRequestA_4c2f6899')}
              </p>
              <Button
                variant='outline'
                loading={requesting}
                disabled={requesting}
                onClick={handleRequest}
              >
                {requesting
                  ? t('extracted.data.dataRequestSection.requesting_6a7b8c9d')
                  : t('extracted.data.dataRequestSection.requestDataExport_0e1f2a3b')}
              </Button>
            </div>
          ) : (
            <Button
              variant='outline'
              disabled={requesting}
              onClick={handleRequest}
            >
              {requesting
                ? t('extracted.data.dataRequestSection.requesting_6a7b8c9d')
                : t('extracted.data.dataRequestSection.requestDataExport_0e1f2a3b')}
            </Button>
          )}

          {error && <p className='text-sm text-destructive'>{error}</p>}
        </>
      )}
    </div>
  )
}
