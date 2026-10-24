'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

const DialogBase = DialogPrimitive.Root
const DialogTriggerBase = DialogPrimitive.Trigger
const DialogPortalBase = DialogPrimitive.Portal
const DialogCloseBase = DialogPrimitive.Close

function DialogOverlayBase({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Overlay>>
}) {
  const overlayProps = {
    ref,
    'data-pw': 'dialog-overlay',
    className: cn(
      'fixed inset-0 z-50 w-screen bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    ),
    ...props,
  }
  return React.createElement(DialogPrimitive.Overlay, overlayProps)
}
DialogOverlayBase.displayName = DialogPrimitive.Overlay.displayName

function DialogContentBase({
  className,
  children,
  hideOverlay,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Content>>
  hideOverlay?: boolean
}) {
  return React.createElement(
    DialogPortalBase,
    null,
    hideOverlay ? null : React.createElement(DialogOverlayBase),
    React.createElement(
      DialogPrimitive.Content,
      {
        ref,
        className: cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-3 border bg-background p-4 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
          className,
        ),
        ...props,
      },
      children,
    ),
  )
}
DialogContentBase.displayName = DialogPrimitive.Content.displayName

const DialogHeaderBase = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
  React.createElement('div', {
    className: cn('flex flex-col gap-1 text-center sm:text-left', className),
    ...props,
  })
DialogHeaderBase.displayName = 'DialogHeader'

const DialogFooterBase = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
  React.createElement('div', {
    className: cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className),
    ...props,
  })
DialogFooterBase.displayName = 'DialogFooter'

function DialogTitleBase({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Title>>
}) {
  return React.createElement(DialogPrimitive.Title, {
    ref,
    className: cn('text-base font-semibold leading-none tracking-tight', className),
    ...props,
  })
}
DialogTitleBase.displayName = DialogPrimitive.Title.displayName

function DialogDescriptionBase({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
  ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Description>>
}) {
  return React.createElement(DialogPrimitive.Description, {
    ref,
    className: cn('text-sm text-muted-foreground', className),
    ...props,
  })
}
DialogDescriptionBase.displayName = DialogPrimitive.Description.displayName

export {
  DialogBase,
  DialogPortalBase,
  DialogOverlayBase,
  DialogTriggerBase,
  DialogCloseBase,
  DialogContentBase,
  DialogHeaderBase,
  DialogFooterBase,
  DialogTitleBase,
  DialogDescriptionBase,
}
