'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CreateSourceForm } from './create-source-form'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SubmitSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SubmitSourceDialog({ open, onOpenChange }: SubmitSourceDialogProps) {
  const t = useTranslations()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle data-pw='submit-source-dialog-title'>
            {t('extracted.sources.submitSourceDialog.submitASource_0715eeda')}
          </DialogTitle>
          <DialogDescription>
            {t('extracted.sources.submitSourceDialog.enterAnRssFeedUrlTo_615ff704')}
          </DialogDescription>
        </DialogHeader>
        <CreateSourceForm onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

export function SubmitSourceButton() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        className='shrink-0'
        onClick={() => setOpen(true)}
        data-pw='sources-submit-source-button'
      >
        {t('extracted.sources.submitSourceDialog.submitSource_525f8da6')}
      </Button>
      <SubmitSourceDialog
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
