'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  updateReferralLink,
  deleteReferralLink,
  activateReferralLink,
  deactivateReferralLink,
  unfurlReferralLink,
  getMyReferralLinksClient,
} from '@/lib/api/client/referral-links'
import onError, { onSuccess } from '@/lib/on-error'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import type { UserReferralLinkWithDetails, PageInfo } from '@/types/api-responses'
import { topicHref } from '@/lib/links/entity-href'
import { isActive, isChildLink, groupByProgram } from './referral-links-manager-utils'
import { AddReferralLink } from './referral-links-manager/add-referral-link'
import { ReferralLinkGroups } from './referral-links-manager/referral-link-groups'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialLinks: UserReferralLinkWithDetails[]
  initialPageInfo: PageInfo | null
  hasPlusTier: boolean
}

export function ReferralLinksManager({ initialLinks, initialPageInfo, hasPlusTier }: Props) {
  const t = useTranslations()
  const { push } = useRouter()
  const initialPage = useMemo(
    () => ({
      results: initialLinks,
      page_info: initialPageInfo ?? {
        has_next_page: false,
        start_cursor: null,
        end_cursor: null,
      },
    }),
    [initialLinks, initialPageInfo],
  )
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(
      initialPage,
      '/api/v1/my/referral-links',
      {},
      {
        loadPage: getMyReferralLinksClient,
      },
    )
  const [linkOverrides, setLinkOverrides] = useState<Record<string, UserReferralLinkWithDetails>>(
    {},
  )
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const { loadingIds, runWithLoadingId } = useLoadingIds()

  // Group links by program, sorted alphabetically by program name. Amex-unfurled per-card
  // children are lifecycle-managed via their parent and excluded from this list entirely.
  const links = pages.flatMap(page =>
    page.results.flatMap(link => {
      if (deletedIds.has(link.id)) return []
      const resolved = linkOverrides[link.id] ?? link
      return isChildLink(resolved) ? [] : [resolved]
    }),
  )
  const groups = groupByProgram(links)

  async function handleSaveLabel(link: UserReferralLinkWithDetails) {
    const newLabel = editLabel.trim() || null
    try {
      await runWithLoadingId(`edit-${link.id}`, async () => {
        await updateReferralLink(link.id, { label: newLabel })
        setLinkOverrides(prev => ({ ...prev, [link.id]: { ...link, label: newLabel } }))
        setEditingId(null)
        toast.success(t('extracted.my.referralLinksManager.labelUpdated_1e4f4b5d'))
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.referralLinksManager.failedToUpdateLabel_cee33cf4'),
      })
    }
  }

  async function handleToggleActive(link: UserReferralLinkWithDetails) {
    const wasActive = isActive(link)
    try {
      await runWithLoadingId(`toggle-${link.id}`, async () => {
        const res = wasActive
          ? await deactivateReferralLink(link.id)
          : await activateReferralLink(link.id)
        setLinkOverrides(prev => ({
          ...prev,
          [link.id]: {
            ...link,
            activated_at: res.referral_link.activated_at,
            deactivated_at: res.referral_link.deactivated_at,
          },
        }))
        toast.success(
          wasActive
            ? t('extracted.my.referralLinksManager.linkDeactivated_e2a08224')
            : t('extracted.my.referralLinksManager.linkActivated_25b23bff'),
        )
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.referralLinksManager.failedToUpdateLink_9a4cc50c'),
      })
    }
  }

  async function handleUnfurl(link: UserReferralLinkWithDetails) {
    try {
      await runWithLoadingId(`unfurl-${link.id}`, async () => {
        const res = await unfurlReferralLink(link.id)
        setLinkOverrides(prev => ({
          ...prev,
          [link.id]: {
            ...(prev[link.id] ?? link),
            unfurl_requested_at: res.referral_link.unfurl_requested_at,
            unfurl_completed_at: res.referral_link.unfurl_completed_at,
            unfurl_failed_at: res.referral_link.unfurl_failed_at,
            unfurl_last_error: res.referral_link.unfurl_last_error,
          },
        }))
        onSuccess(t('extracted.my.referralLinksManager.unfurlRequestedPerCardLinksWill_f4bc1558'))
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.referralLinksManager.failedToRequestUnfurl_9e86096e'),
      })
    }
  }

  async function handleDelete(id: string) {
    try {
      await runWithLoadingId(`delete-${id}`, async () => {
        await deleteReferralLink(id)
        setDeletedIds(prev => new Set(prev).add(id))
        setConfirmingDeleteId(null)
        toast.success(t('extracted.my.referralLinksManager.referralLinkRemoved_89f3e010'))
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.referralLinksManager.failedToRemoveLink_dadf1223'),
      })
    }
  }

  return (
    <div className='space-y-4'>
      <InfiniteScroll
        hasNextPage={hasNextPage}
        endCursor={endCursor}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
        resetKey={resetKey}
      >
        <ReferralLinkGroups
          confirmingDeleteId={confirmingDeleteId}
          editLabel={editLabel}
          editingId={editingId}
          groups={groups}
          hasPlusTier={hasPlusTier}
          loadingIds={loadingIds}
          onDelete={handleDelete}
          onSaveLabel={handleSaveLabel}
          onToggleActive={handleToggleActive}
          onUnfurl={handleUnfurl}
          setConfirmingDeleteId={setConfirmingDeleteId}
          setEditLabel={setEditLabel}
          setEditingId={setEditingId}
        />
      </InfiniteScroll>

      <AddReferralLink
        onSelectProgram={id => {
          push(topicHref({ topic_type: 'referral_program', id }, 'referral-links'))
        }}
      />
    </div>
  )
}
