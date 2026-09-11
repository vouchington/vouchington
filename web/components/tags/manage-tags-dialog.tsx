'use client'

import { Suspense, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { ManageTagsContent } from '@/components/tags/manage-tags-content'
import { ManageTagsCard } from '@/components/tags/manage-tags-card'
import { useAuth } from '@/lib/auth/context'
import { fetchEntityRelations } from '@/lib/api/client/entity-relations'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { EnumOption } from './types'

interface ManageTagsDialogProps {
  entityType: string
  entityId: string
  predicate: string
  objectType: 'topic' | 'post' | 'url'
  label: string
  heading: string
  dialogTitle: string
  triggerLabel: string
  dialogDescription?: string
  manageHref?: string
  enumOptions?: EnumOption[]
  enumSelectLabel?: string
  trigger?: (openDialog: () => void) => ReactNode
  loadingText: string
  errorText: string
  isAuthenticated?: boolean
}

export function ManageTagsDialog({
  entityType,
  entityId,
  predicate,
  objectType,
  label,
  heading,
  dialogTitle,
  triggerLabel,
  dialogDescription,
  manageHref,
  enumOptions,
  enumSelectLabel,
  trigger,
  loadingText,
  errorText,
  isAuthenticated,
}: ManageTagsDialogProps) {
  const t = useTranslations()
  const router = useRouter()
  const { isAuthenticated: authFromContext } = useAuth()
  const authenticated = isAuthenticated ?? authFromContext
  const [open, setOpen] = useState(false)
  const [relationsPromise, setRelationsPromise] = useState<
    Promise<EntityRelationsResponse> | undefined
  >(undefined)
  const resolvedDialogDescription = dialogDescription || heading

  const loadRelations = () => {
    setRelationsPromise(
      fetchEntityRelations(entityType, entityId, predicate, objectType, { sort: 'best' }),
    )
  }

  const refreshRelations = () => {
    loadRelations()
    router.refresh()
  }

  const openDialog = () => {
    loadRelations()
    setOpen(true)
  }

  const content = (
    <>
      <ManageTagsCard
        heading={heading}
        hideCardStyles
      >
        {relationsPromise ? (
          <ErrorBoundary fallback={<div className='text-sm text-destructive'>{errorText}</div>}>
            <Suspense fallback={<div className='text-sm text-muted-foreground'>{loadingText}</div>}>
              <ManageTagsContent
                entityType={entityType}
                entityId={entityId}
                predicate={predicate}
                objectType={objectType}
                label={label}
                relationsPromise={relationsPromise}
                enumOptions={enumOptions}
                enumSelectLabel={enumSelectLabel}
                isAuthenticated={authenticated}
                onRelationsChange={refreshRelations}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <div className='text-sm text-muted-foreground'>{loadingText}</div>
        )}
      </ManageTagsCard>
      {manageHref ? (
        <DialogFooter>
          <Button
            asChild
            variant='ghost'
            size='sm'
          >
            <Link
              prefetch={false}
              href={manageHref}
            >
              {t('extracted.tags.manageTagsDialog.manageAllTags_15e8f830')}
            </Link>
          </Button>
        </DialogFooter>
      ) : null}
    </>
  )

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) setRelationsPromise(undefined)
  }

  return (
    <>
      {trigger ? (
        trigger(openDialog)
      ) : (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={openDialog}
        >
          {triggerLabel}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription className={dialogDescription ? undefined : 'sr-only'}>
              {resolvedDialogDescription}
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  )
}
