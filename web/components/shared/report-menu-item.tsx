'use client'

import { useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ReportableEntityType } from '@/lib/api/client/reports'
import { EntityActionIcons } from './entity-action-icons'
import { ReportDialog } from './report-dialog'
import { getReportStorageKey, getReportSubmittedKey, REPORT_SUBMITTED_EVENT } from './report-state'
import { useTranslations } from '@/lib/i18n/use-translations'

function getReported(entityType: ReportableEntityType, entityId: string) {
  try {
    return sessionStorage.getItem(getReportStorageKey(entityType, entityId)) === 'submitted'
  } catch {
    return false
  }
}

function useReported(entityType: ReportableEntityType, entityId: string) {
  // useSyncExternalStore: subscribe returns a cleanup, getSnapshot reads client
  // state, getServerSnapshot returns false (sessionStorage unavailable on SSR).
  return useSyncExternalStore(
    onStoreChange => {
      const key = getReportStorageKey(entityType, entityId)
      const onReportSubmitted = (event: Event) => {
        if (getReportSubmittedKey(event) === key) onStoreChange()
      }
      window.addEventListener(REPORT_SUBMITTED_EVENT, onReportSubmitted)
      return () => {
        window.removeEventListener(REPORT_SUBMITTED_EVENT, onReportSubmitted)
      }
    },
    () => getReported(entityType, entityId),
    () => false,
  )
}

interface ItemProps {
  entityType: ReportableEntityType
  entityId: string
}

export function ReportMenuItem({ entityType, entityId }: ItemProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const reported = useReported(entityType, entityId)
  /* c8 ignore next -- icon alias is covered by Vitest; selected browser coverage does not visit report menu */
  const ReportIcon = EntityActionIcons.report

  return (
    <>
      <DropdownMenuItem
        onSelect={(e: Event) => {
          e.preventDefault()
          setOpen(true)
        }}
        disabled={reported}
        data-pw='report-menu-item'
      >
        <ReportIcon />
        {reported
          ? t('extracted.shared.reportMenuItem.reported_34540bb7')
          : t('extracted.shared.reportMenuItem.report_b6ce788d')}
      </DropdownMenuItem>
      <ReportDialog
        entityType={entityType}
        entityId={entityId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

interface InlineProps {
  entityType: ReportableEntityType
  entityId: string
  isAuthenticated: boolean
  label?: string
}

export function ReportInlineButton({ entityType, entityId, isAuthenticated, label }: InlineProps) {
  if (!isAuthenticated) return null

  return (
    <ReportInlineButtonContent
      entityType={entityType}
      entityId={entityId}
      label={label}
    />
  )
}

function ReportInlineButtonContent({
  entityType,
  entityId,
  label,
}: Omit<InlineProps, 'isAuthenticated'>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const reported = useReported(entityType, entityId)
  /* c8 ignore next -- icon alias is covered by Vitest; selected browser coverage does not visit report inline action */
  const ReportIcon = EntityActionIcons.report
  const resolvedLabel = label ?? t('extracted.shared.reportMenuItem.report_b6ce788d')
  const reportedLabel = t('extracted.shared.reportMenuItem.reported_34540bb7')

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='touchSm'
        onClick={() => setOpen(true)}
        disabled={reported}
        aria-label={reported ? reportedLabel : resolvedLabel}
        data-pw='report-inline-button'
      >
        <ReportIcon data-icon='inline-start' />
        {reported ? reportedLabel : resolvedLabel}
      </Button>
      <ReportDialog
        entityType={entityType}
        entityId={entityId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

interface KebabProps {
  entityType: ReportableEntityType
  entityId: string
  'data-pw'?: string
}

export function ReportMenuKebab({
  entityType,
  entityId,
  'data-pw': dataPw = 'report-menu-kebab-trigger',
}: KebabProps) {
  /* c8 ignore next -- icon alias is covered by Vitest; selected browser coverage does not visit report kebab */
  const t = useTranslations()
  const MoreActionsIcon = EntityActionIcons.more

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='min-h-11 min-w-11 p-0'
          aria-label={t('extracted.shared.reportMenuItem.reportActions_4cbeddf2')}
          onClick={e => e.stopPropagation()}
          data-pw={dataPw}
        >
          <MoreActionsIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <ReportMenuItem
          entityType={entityType}
          entityId={entityId}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
