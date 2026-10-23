'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  DialogBase as Dialog,
  DialogCloseBase as DialogClose,
  DialogContentBase,
  DialogDescriptionBase as DialogDescription,
  DialogFooterBase as DialogFooter,
  DialogHeaderBase as DialogHeader,
  DialogOverlayBase as DialogOverlay,
  DialogPortalBase as DialogPortal,
  DialogTitleBase as DialogTitle,
  DialogTriggerBase as DialogTrigger,
} from '@/components/dialog-primitives'

function DialogCloseButton() {
  const t = useTranslations()
  return (
    <DialogClose className='absolute right-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground'>
      <X className='h-4 w-4' />
      <span className='sr-only'>{t('extracted.ui.dialog.close_7d9eb7ac')}</span>
    </DialogClose>
  )
}

function DialogContent({
  children,
  hideCloseButton,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Content>>
  hideCloseButton?: boolean
  hideOverlay?: boolean
}) {
  return (
    <DialogContentBase {...props}>
      {children}
      {!hideCloseButton && <DialogCloseButton />}
    </DialogContentBase>
  )
}
DialogContent.displayName = DialogPrimitive.Content.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
