'use client'

import { clientApi } from './instance'
import type { ModerationAppeal } from '@/types/appeals'

export interface AppealsPage {
  appeals: ModerationAppeal[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

export function listModerationAppealsClient(options: {
  after: string
  status?: string
  mine?: boolean
}): Promise<AppealsPage> {
  return clientApi.get('/api/v1/appeals', {
    searchParams: { limit: 50, after: options.after, status: options.status, mine: options.mine },
  })
}

export function createModerationAppeal(data: {
  target_type: 'warning' | 'ban' | 'removal' | 'suspension'
  target_id?: string
  post_removal_kind?: 'platform' | 'community'
  appeal_reason: string
  cf_turnstile_response?: string
}): Promise<{ appeal: ModerationAppeal; isDuplicate: boolean }> {
  return clientApi.post('/api/v1/appeals', data)
}

export function updateAppealDraft(
  appealId: string,
  data: {
    public_response?: string
    internal_notes?: string
  },
): Promise<{ appeal: ModerationAppeal }> {
  return clientApi.patch(`/api/v1/appeals/${appealId}`, data)
}

export function approveAppeal(appealId: string): Promise<{ appeal: ModerationAppeal }> {
  return clientApi.post(`/api/v1/appeals/${appealId}/approval`, {})
}

export function sendAppealResolution(appealId: string): Promise<{ appeal: ModerationAppeal }> {
  return clientApi.post(`/api/v1/appeals/${appealId}/delivery`, {})
}

export function resolveAppeal(
  appealId: string,
  action: 'accept' | 'reduce' | 'deny',
): Promise<{ appeal: ModerationAppeal }> {
  return clientApi.post(`/api/v1/appeals/${appealId}/resolution`, { action })
}

const RERUN_POLL_ATTEMPTS = 20
const RERUN_POLL_DELAY_MS = 3000

export class AppealDraftReconciliationTimeoutError extends Error {
  override name = 'AppealDraftReconciliationTimeoutError'
}

export function getModerationAppealClient(appealId: string): Promise<ModerationAppeal> {
  return clientApi
    .get<{ appeal: ModerationAppeal }>(`/api/v1/appeals/${appealId}`)
    .then(response => response.appeal)
}

function getAuthoritativeModerationAppealClient(appealId: string): Promise<ModerationAppeal> {
  return clientApi
    .get<{ appeal: ModerationAppeal }>(`/api/v1/appeals/${appealId}`, {
      searchParams: { consistency: 'primary' },
    })
    .then(response => response.appeal)
}

export function hasUpdatedAppealDraftLifecycle(
  before: ModerationAppeal,
  refreshed: ModerationAppeal,
): boolean {
  return (
    refreshed.ai_drafted_at !== null &&
    refreshed.ai_drafted_at !== before.ai_drafted_at &&
    refreshed.latest_lifecycle_change_id !== before.latest_lifecycle_change_id
  )
}

export function enqueueAppealAIDraftRerun(appealId: string): Promise<void> {
  return clientApi.post(`/api/v1/appeals/${appealId}/resolution-drafts`, {})
}

export async function reconcileAppealAIDraft(
  appeal: ModerationAppeal,
): Promise<{ appeal: ModerationAppeal }> {
  return { appeal: await pollForUpdatedAppealDraft(appeal) }
}

async function pollForUpdatedAppealDraft(
  appeal: ModerationAppeal,
  attempt = 0,
): Promise<ModerationAppeal> {
  const refreshed = await getAuthoritativeModerationAppealClient(appeal.id)
  if (hasUpdatedAppealDraftLifecycle(appeal, refreshed)) return refreshed
  if (attempt + 1 === RERUN_POLL_ATTEMPTS) {
    throw new AppealDraftReconciliationTimeoutError(
      'The AI draft is still processing. Refresh to check again.',
    )
  }
  await new Promise<void>(resolve => setTimeout(resolve, RERUN_POLL_DELAY_MS))
  return pollForUpdatedAppealDraft(appeal, attempt + 1)
}
