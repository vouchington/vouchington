'use client'

import { useRef, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { importCrmCsv, MAX_CRM_CSV_FILE_BYTES } from '@/lib/api/client/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CrmCsvImportDialog() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [successBatch, setSuccessBatch] = useState<{ id: string; total_rows: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setErrors([])
      setSuccessBatch(null)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    ;(e.target as HTMLInputElement).value = ''

    setLoading(true)
    setErrors([])
    setSuccessBatch(null)

    try {
      if (file.size > MAX_CRM_CSV_FILE_BYTES) {
        setErrors([t('extracted.crm.crmCsvImportDialog.failedToImportCsv_9b3f1c85')])
        return
      }
      const csvText = await file.text()
      const result = await importCrmCsv(csvText)
      if (result.valid) {
        setSuccessBatch({ id: result.batch.id, total_rows: result.batch.total_rows })
        onSuccess(
          t('extracted.crm.crmCsvImportDialog.queuedCountContactsForImport_1618043f', {
            count: result.batch.total_rows,
          }),
        )
      } else {
        const msgs: string[] = []
        if (result.error) msgs.push(result.error)
        if (result.validation?.rows) {
          for (const row of result.validation.rows) {
            if (!row.valid) {
              for (const error of row.errors) {
                msgs.push(
                  t('extracted.crm.crmCsvImportDialog.rowRowindexError_5c8a2f61', {
                    rowIndex: row.row_index + 2,
                    error,
                  }),
                )
              }
            }
          }
        }
        setErrors(
          msgs.length > 0 ? msgs : [t('extracted.crm.crmCsvImportDialog.importFailed_2d7e9b40')],
        )
      }
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : t('extracted.crm.crmCsvImportDialog.failedToImportCsv_9b3f1c85')
      setErrors([msg])
      onError(error, { fallback: msg, tags: { form: 'crm-csv-import' } })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogTrigger asChild>
        <Button
          variant='outline'
          data-pw='crm-import-csv-trigger'
        >
          <Upload className='mr-2 h-4 w-4' />
          {t('extracted.crm.crmCsvImportDialog.importCsv_9982ac26')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('extracted.crm.crmCsvImportDialog.importCrmContacts_cc32ddf6')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('extracted.crm.crmCsvImportDialog.uploadACsvFileToImport_4a3f8d0d')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <p className='text-sm text-muted-foreground'>
            {t('extracted.crm.crmCsvImportDialog.uploadACsvFileWithColumns_a16366ca')}{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.name_82a3537f')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.email_82244417')}</code>{' '}
            {t('extracted.crm.crmCsvImportDialog.required_89db19f6')},{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.phone_45569da5')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.vertical_34da5602')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.followerCount_a3ae0b81')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.instagram_5ede5673')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.tiktok_5beeafea')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.youtube_24e6654b')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.x_2d711642')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.linkedin_84308bea')}</code>,{' '}
            <code>{t('extracted.crm.crmCsvImportDialog.notes_ab5aa970')}</code>.
          </p>
          <div className='flex gap-3'>
            <Button
              onClick={() => fileInputRef.current?.click()}
              loading={loading}
              disabled={loading}
            >
              {!loading && <Upload className='h-4 w-4' />}
              {loading
                ? t('extracted.crm.crmCsvImportDialog.importing_4e7a1d92')
                : t('extracted.crm.crmCsvImportDialog.chooseCsvFile_6f2b8c04')}
            </Button>
            <Input
              ref={fileInputRef}
              type='file'
              accept='.csv'
              className='hidden'
              onChange={handleFileChange}
            />
          </div>
          {errors.length > 0 && (
            <div className='rounded-md border border-destructive/50 bg-destructive/10 p-3'>
              <p className='mb-1 text-sm font-medium text-destructive'>
                {t('extracted.crm.crmCsvImportDialog.validationErrors_4a5f7bc3')}
              </p>
              <ul className='space-y-1'>
                {errors.map(err => (
                  <li
                    key={err}
                    className='text-sm text-destructive'
                  >
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {successBatch && (
            <div className='rounded-md border border-green-500/50 bg-green-500/10 p-3'>
              <p className='text-sm text-green-700 dark:text-green-400'>
                {t(
                  'extracted.crm.crmCsvImportDialog.successfullyQueuedCountContactsForImport_09662607',
                  { count: successBatch.total_rows },
                )}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
