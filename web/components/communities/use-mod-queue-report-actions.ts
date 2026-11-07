'use client'

import { startTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { openModmailThreadForReport } from '@/lib/api/client/modmail'
import {
  claimCommunityModerationReport,
  deEscalateCommunityModerationReport,
  escalateCommunityModerationReport,
  openModInternalThreadForReport,
  releaseCommunityModerationReport,
} from '@/lib/api/client/mod-queue-actions'
import { messagesHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'
import type { CommunityModerationReport } from '@/types/api-responses'

export function useModQueueReportActions({
  communitySlug,
  onClaimToggle,
  onEscalateToggle,
}: {
  communitySlug: string
  onClaimToggle?: (reportId: string) => void
  onEscalateToggle?: (reportId: string, escalated: boolean) => void
}) {
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
    } catch (err) {
      onError(err, {
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
    } catch (err) {
      onError(err, {
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
    } catch (err) {
      onError(err, {
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
    } catch (err) {
      onError(err, {
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
    } catch (err) {
      onError(err, {
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
    } catch (err) {
      onError(err, {
        fallback: t('extracted.communities.modQueueReports.failedToRemoveEscalation_c89bb097'),
        tags: { action: 'de-escalate-report', communitySlug },
      })
    } finally {
      setEscalatingId(null)
    }
  }

  return {
    claimingId,
    discussingId,
    escalatingId,
    handleClaim,
    handleDeEscalate,
    handleDiscuss,
    handleEscalate,
    handleRelease,
    handleSendModmail,
    sendingModmail,
  }
}

export type ModQueueReportActions = ReturnType<typeof useModQueueReportActions>
