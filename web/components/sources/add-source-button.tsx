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
import { useAuth } from '@/lib/auth/context'
import { AddSourceForm } from './add-source-form'
import { ADD_SOURCE_CONTENT, type AddSourceKind } from './add-source-content'

export function AddSourceButton({ kind }: { kind: AddSourceKind }) {
  const { currentUser } = useAuth()
  const [open, setOpen] = useState(false)

  if (!currentUser) return null

  const content = ADD_SOURCE_CONTENT[kind]

  return (
    <>
      <Button
        className='shrink-0'
        size='touch'
        onClick={() => setOpen(true)}
        data-pw='add-source-button'
      >
        {content.buttonLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle data-pw='add-source-dialog-title'>{content.dialogTitle}</DialogTitle>
            <DialogDescription>{content.dialogDescription}</DialogDescription>
          </DialogHeader>
          <AddSourceForm
            kind={kind}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
