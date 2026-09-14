/* oxlint-disable max-lines, jsx-a11y/no-noninteractive-tabindex -- claim/escalate/discuss controls grew the file beyond 200 lines; focusable cards support moderation queue navigation while nested links/buttons keep native behavior. */
'use client'

import { startTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check, MessageSquare, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { judgementLabel, judgementVariant } from '@/components/admin/report-judgement-format'
import { openModmailThreadForReport } from '@/lib/api/client/modmail'
import {
  claimCommunityModerationReport,
  deEscalateCommunityModerationReport,
  escalateCommunityModerationReport,
  openModInternalThreadForReport,
  releaseCommunityModerationReport,
} from '@/lib/api/client/mod-queue-actions'
import { messagesHref } from '@/lib/links/entity-href'
import onError from '@/lib/on-error'
import {
  ModerationSlaBadge,
  ReportCountBadge,
} from '@/components/moderation/moderation-queue-badges'
import { ReportTargetContent } from '@/components/moderation/report-target-content'
import type { CommunityModerationReport } from '@/types/api-responses'
import { ModQueueWarnButton } from './mod-queue-warn-button'
import { ModQueueBanEvasionActions, ModQueueBanEvasionInfo } from './mod-queue-ban-evasion'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ModQueueReportsProps {
  activeKey?: string | null
  bulkDisabled?: boolean
  communitySlug: string
  currentUserId?: string | null
  isStaff?: boolean
  loading: string | null
  onActiveChange?: (key: string) => void
  onResolve: (report: CommunityModerationReport, status: 'reviewed' | 'dismissed') => void
  /** Called after a warn succeeds so the caller can remove the now-actioned report. */
  onWarn?: (reportId: string) => void
  /** Called after a ban-evasion confirm/dismiss so the caller can remove the actioned report. */
  onBanEvasionAction?: (reportId: string) => void
  onSelectionToggle: (reportId: string) => void
  onClaimToggle?: (reportId: string) => void
  onEscalateToggle?: (reportId: string, escalated: boolean) => void
  reports: CommunityModerationReport[]
  selectedIds: ReadonlySet<string>
}

const noop = () => {}

export function ModQueueReports({
  activeKey = null,
  bulkDisabled = false,
  communitySlug,
  currentUserId = null,
  isStaff = false,
  loading,
  onActiveChange = noop,
  onResolve,
  onWarn,
  onBanEvasionAction,
  onSelectionToggle,
  onClaimToggle,
  onEscalateToggle,
  reports,
  selectedIds,
}: ModQueueReportsProps) {
  const t = useTranslations()
  const router = useRouter()
  const [sendingModmail, setSendingModmail] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [escalatingId, setEscalatingId] = useState<string | null>(null)
  const [discussingId, setDiscussingId] = useState<string | null>(null)

  async function handleSendModmail(report: CommunityModerationReport) {
    if (sendingModmail === report.id) return
    setSendingModmail(report.id)
    try {
      const { conversation } = await openModmailThreadForReport(communitySlug, report.id)
      router.push(messagesHref(conversation))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueueReports.failedToOpenModmailThread_3556da3b'),
        tags: { action: 'send-modmail', communitySlug },
      })
    } finally {
      setSendingModmail(null)
    }
  }

  async function handleDiscuss(reportId: string) {
    if (discussingId === reportId) return
    setDiscussingId(reportId)
    try {
      const { conversation } = await openModInternalThreadForReport(communitySlug, reportId)
      router.push(messagesHref(conversation))
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.modQueueReports.failedToOpenInternalDiscussionThread_3243e335',
        ),
        tags: { action: 'mod-internal-thread', communitySlug },
      })
    } finally {
      setDiscussingId(null)
    }
  }

  async function handleClaim(reportId: string) {
    if (claimingId === reportId) return
    setClaimingId(reportId)
    try {
      await claimCommunityModerationReport(communitySlug, reportId)
      onClaimToggle?.(reportId)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueueReports.failedToClaimReport_0c3d37cb'),
        tags: { action: 'claim-report', communitySlug },
      })
    } finally {
      setClaimingId(null)
    }
  }

  async function handleRelease(reportId: string) {
    if (claimingId === reportId) return
    setClaimingId(reportId)
    try {
      await releaseCommunityModerationReport(communitySlug, reportId)
      onClaimToggle?.(reportId)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueueReports.failedToReleaseReportClaim_92ecdb84'),
        tags: { action: 'release-report', communitySlug },
      })
    } finally {
      setClaimingId(null)
    }
  }

  async function handleEscalate(reportId: string) {
    if (escalatingId === reportId) return
    setEscalatingId(reportId)
    try {
      await escalateCommunityModerationReport(communitySlug, reportId)
      onEscalateToggle?.(reportId, true)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueueReports.failedToEscalateReport_2c058a4e'),
        tags: { action: 'escalate-report', communitySlug },
      })
    } finally {
      setEscalatingId(null)
    }
  }

  async function handleDeEscalate(reportId: string) {
    if (escalatingId === reportId) return
    setEscalatingId(reportId)
    try {
      await deEscalateCommunityModerationReport(communitySlug, reportId)
      onEscalateToggle?.(reportId, false)
      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.communities.modQueueReports.failedToRemoveEscalation_c89bb097'),
        tags: { action: 'de-escalate-report', communitySlug },
      })
    } finally {
      setEscalatingId(null)
    }
  }

  return (
    <div className='space-y-3'>
      {reports.map(report => {
        const queueKey = `report:${report.id}`
        const active = activeKey === queueKey
        const targetUserId = report.target_user_id ?? null
        const isBanEvasion = Boolean(report.community_ban_evasion)
        const claim = report.claim ?? null
        const isClaimedByMe = claim !== null && claim.claimed_by_id === currentUserId
        const isClaimedByOther = claim !== null && claim.claimed_by_id !== currentUserId
        const isEscalated = Boolean(report.escalated_at)
        return (
          <div
            key={report.id}
            className={cn(
              'rounded-md border bg-card p-4 outline-none transition-colors',
              active && 'ring-2 ring-ring ring-offset-2',
            )}
            data-report-id={report.id}
            data-pw='mod-queue-report-card'
            data-moderation-queue-key={queueKey}
            data-active={active}
            tabIndex={0}
            onFocus={() => onActiveChange(queueKey)}
          >
            <div className='flex gap-3'>
              <Checkbox
                aria-label={t(
                  'extracted.communities.modQueueReports.selectReportForLabel_a4d72044',
                  {
                    label: report.target_label ?? report.entity_id,
                  },
                )}
                checked={selectedIds.has(report.id)}
                disabled={bulkDisabled}
                onCheckedChange={() => onSelectionToggle(report.id)}
              />
              <div className='flex flex-col gap-1'>
                <p className='text-xs uppercase text-muted-foreground'>{report.entity_type}</p>
                {report.target_path ? (
                  <Link
                    href={report.target_path}
                    className='font-semibold underline'
                    prefetch={false}
                  >
                    <ReportTargetContent
                      fallback={report.target_label ?? report.entity_id}
                      targetContent={report.target_content}
                    />
                  </Link>
                ) : (
                  <p className='font-semibold'>
                    <ReportTargetContent
                      fallback={report.target_label ?? report.entity_id}
                      targetContent={report.target_content}
                    />
                  </p>
                )}
                <div className='flex flex-wrap gap-2'>
                  <ModerationSlaBadge createdAt={report.created_at} />
                  <ReportCountBadge count={report.report_count} />
                  {isEscalated && (
                    <Badge
                      variant='destructive'
                      data-pw='report-escalated-badge'
                    >
                      {t('extracted.communities.modQueueReports.escalated_b710aaaa')}
                    </Badge>
                  )}
                  {isClaimedByMe && (
                    <Badge
                      variant='outline'
                      data-pw='report-claimed-by-me-badge'
                    >
                      {t('extracted.communities.modQueueReports.claimedByYou_c0a65290')}
                    </Badge>
                  )}
                  {isClaimedByOther && (
                    <Badge
                      variant='secondary'
                      data-pw='report-claimed-by-other-badge'
                    >
                      {t('extracted.communities.modQueueReports.claimed_ddcd2779')}
                    </Badge>
                  )}
                </div>
                {report.community_ban_evasion ? (
                  <ModQueueBanEvasionInfo banEvasion={report.community_ban_evasion} />
                ) : null}
              </div>
            </div>
            {!isBanEvasion && (
              <p className='mt-2 text-sm'>
                <span className='font-medium'>
                  {t('extracted.communities.modQueueReports.reason_3425d108')}
                </span>{' '}
                {report.reason}
              </p>
            )}
            {isStaff && report.note ? (
              <p
                className={`${isBanEvasion ? 'mt-2' : 'mt-1'} whitespace-pre-wrap break-words text-sm text-muted-foreground`}
              >
                {report.note}
              </p>
            ) : null}
            {report.judgement ? (
              <div className='mt-2 flex flex-wrap items-center gap-2'>
                <Badge variant={judgementVariant(report.judgement.recommended_action)}>
                  {judgementLabel(report.judgement.recommended_action)}
                </Badge>
                {report.judgement.is_stale ? (
                  <Badge variant='outline'>
                    {t('extracted.communities.modQueueReports.outdated_c759f42e')}
                  </Badge>
                ) : null}
                <span className='text-xs text-muted-foreground'>
                  {report.judgement.public_response}
                </span>
              </div>
            ) : null}
            <div className='mt-4 flex flex-wrap gap-2'>
              {isBanEvasion ? (
                <ModQueueBanEvasionActions
                  banEvasion={report.community_ban_evasion!}
                  entityId={report.entity_id}
                  reportId={report.id}
                  disabled={bulkDisabled || loading === report.id}
                  onAction={id => onBanEvasionAction?.(id)}
                />
              ) : (
                <>
                  <Button
                    size='sm'
                    disabled={bulkDisabled || loading === report.id}
                    onClick={() => onResolve(report, 'reviewed')}
                  >
                    <Check className='size-4' />
                    {t('extracted.communities.modQueueReports.reviewed_fad6057b')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={bulkDisabled || loading === report.id}
                    onClick={() => onResolve(report, 'dismissed')}
                  >
                    <X className='size-4' />
                    {t('extracted.communities.modQueueReports.dismiss_48845bff')}
                  </Button>
                  {targetUserId ? (
                    <ModQueueWarnButton
                      userId={targetUserId}
                      communitySlug={communitySlug}
                      reportId={report.id}
                      disabled={bulkDisabled || loading === report.id}
                      onIssued={() => onWarn?.(report.id)}
                    />
                  ) : null}
                  {isClaimedByMe ? (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={claimingId === report.id}
                      loading={claimingId === report.id}
                      onClick={() => {
                        void handleRelease(report.id)
                      }}
                      data-pw='release-report-button'
                    >
                      {t('extracted.communities.modQueueReports.release_e020e3c6')}
                    </Button>
                  ) : (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={claimingId === report.id}
                      loading={claimingId === report.id}
                      onClick={() => {
                        void handleClaim(report.id)
                      }}
                      data-pw='claim-report-button'
                    >
                      {t('extracted.communities.modQueueReports.claim_4ca41db0')}
                    </Button>
                  )}
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={discussingId === report.id}
                    loading={discussingId === report.id}
                    onClick={() => {
                      void handleDiscuss(report.id)
                    }}
                    data-pw='discuss-report-button'
                  >
                    <MessageSquare className='size-4' />
                    {t('extracted.communities.modQueueReports.discuss_3df75fc7')}
                  </Button>
                  {isEscalated ? (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={escalatingId === report.id}
                      loading={escalatingId === report.id}
                      onClick={() => {
                        void handleDeEscalate(report.id)
                      }}
                      data-pw='de-escalate-report-button'
                    >
                      <AlertTriangle className='size-4' />
                      {t('extracted.communities.modQueueReports.removeEscalation_1ed2ef3d')}
                    </Button>
                  ) : (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={escalatingId === report.id}
                      loading={escalatingId === report.id}
                      onClick={() => {
                        void handleEscalate(report.id)
                      }}
                      data-pw='escalate-report-button'
                    >
                      <AlertTriangle className='size-4' />
                      {t('extracted.communities.modQueueReports.escalate_d563aaf7')}
                    </Button>
                  )}
                  {isStaff ? (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={sendingModmail === report.id}
                      loading={sendingModmail === report.id}
                      onClick={() => {
                        void handleSendModmail(report)
                      }}
                      data-pw='send-modmail-button'
                    >
                      <MessageSquare className='size-4' />
                      {t('extracted.communities.modQueueReports.sendMessage_0fe0571f')}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
