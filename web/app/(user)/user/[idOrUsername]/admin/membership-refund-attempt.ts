'use client'

import { useSyncExternalStore } from 'react'
import { createMembershipRefund } from '@/lib/api/client/memberships'
import { chargeKey } from './membership-refund-charge-key.ts'
import {
  isObject,
  isRefundRequest,
  matchesRefundRequest,
} from './membership-refund-attempt-validation.ts'
import type { MembershipRefundFormState } from './membership-refund-form.types.ts'
import type { RefundRequest } from './membership-refund-request.ts'
import type { RefundableCharge } from '@/types/api-responses'
import { majorUnitsInputValue } from '@/lib/money'

const STORAGE_KEY_PREFIX = 'voucha:membership-refund-attempt:v2:'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type MembershipRefundAttempt = {
  actorUserId: string
  request: RefundRequest
  requestFingerprint: string
  idempotencyKey: string
  reconciliationRetryAt: number | null
}

export type MembershipRefundAttemptScope = {
  actorUserId: string
  targetUserId: string
}

export function prepareMembershipRefundAttempt(
  scope: MembershipRefundAttemptScope,
  current: MembershipRefundAttempt | null,
  request: RefundRequest,
  reconciliationRetryAt: number | null,
): MembershipRefundAttempt {
  const requestFingerprint = JSON.stringify([scope.actorUserId, request])
  const attempt = {
    actorUserId: scope.actorUserId,
    request,
    requestFingerprint,
    idempotencyKey:
      current?.requestFingerprint === requestFingerprint
        ? current.idempotencyKey
        : crypto.randomUUID(),
    reconciliationRetryAt,
  }
  persistMembershipRefundAttempt(scope, attempt)
  return attempt
}

export function submitMembershipRefundAttempt(
  attempt: MembershipRefundAttempt,
): ReturnType<typeof createMembershipRefund> {
  return createMembershipRefund({
    ...attempt.request,
    idempotency_key: attempt.idempotencyKey,
  })
}

export function persistPendingRefundAttempt(
  scope: MembershipRefundAttemptScope,
  attempt: MembershipRefundAttempt,
  retryAfterSeconds: number,
): MembershipRefundAttempt {
  const pendingAttempt = {
    ...attempt,
    reconciliationRetryAt: Date.now() + retryAfterSeconds * 1000,
  }
  persistMembershipRefundAttempt(scope, pendingAttempt)
  return pendingAttempt
}

function persistMembershipRefundAttempt(
  scope: MembershipRefundAttemptScope,
  attempt: MembershipRefundAttempt,
): void {
  try {
    sessionStorage.setItem(storageKey(scope), JSON.stringify(attempt))
  } catch {
    /* Best-effort browser persistence. */
  }
}

export function clearMembershipRefundAttempt(scope: MembershipRefundAttemptScope): void {
  const key = storageKey(scope)
  try {
    sessionStorage.removeItem(key)
  } catch {
    try {
      sessionStorage.setItem(key, 'null')
    } catch {
      /* Terminal in-memory cleanup remains authoritative. */
    }
  }
}

export function useMembershipRefundAttempt(
  scope: MembershipRefundAttemptScope,
  charges: RefundableCharge[],
) {
  const storedValue = useSyncExternalStore(
    subscribeToMembershipRefundAttempt,
    () => readStoredValue(scope),
    getServerSnapshot,
  )
  const attempt = parseMembershipRefundAttempt(storedValue, scope)
  if (!attempt) return null
  const charge = charges.find(candidate => matchesRefundRequest(candidate, attempt.request))
  return {
    attempt,
    selectedChargeKey: charge ? chargeKey(charge) : null,
    formState: {
      reason: attempt.request.reason,
      cancel: attempt.request.cancel,
      amountStr: attempt.request.amount ? majorUnitsInputValue(attempt.request.amount) : '',
      note: attempt.request.note ?? '',
    } satisfies MembershipRefundFormState,
    reconciliationRetryAt: attempt.reconciliationRetryAt,
  }
}

function readStoredValue(scope: MembershipRefundAttemptScope): string | null {
  try {
    return sessionStorage.getItem(storageKey(scope))
  } catch {
    return null
  }
}

function parseMembershipRefundAttempt(
  storedValue: string | null,
  scope: MembershipRefundAttemptScope,
): MembershipRefundAttempt | null {
  try {
    const value: unknown = JSON.parse(storedValue ?? 'null')
    return isMembershipRefundAttempt(value, scope) ? value : null
  } catch {
    return null
  }
}

function isMembershipRefundAttempt(
  value: unknown,
  scope: MembershipRefundAttemptScope,
): value is MembershipRefundAttempt {
  if (!isObject(value) || value.actorUserId !== scope.actorUserId) return false
  if (!isRefundRequest(value.request, scope.targetUserId)) return false
  if (value.requestFingerprint !== JSON.stringify([scope.actorUserId, value.request])) return false
  if (typeof value.idempotencyKey !== 'string' || !UUID_PATTERN.test(value.idempotencyKey)) {
    return false
  }
  return (
    value.reconciliationRetryAt === null ||
    (typeof value.reconciliationRetryAt === 'number' &&
      Number.isInteger(value.reconciliationRetryAt) &&
      value.reconciliationRetryAt > 0)
  )
}

function storageKey(scope: MembershipRefundAttemptScope): string {
  return `${STORAGE_KEY_PREFIX}${scope.actorUserId}:${scope.targetUserId}`
}

function subscribeToMembershipRefundAttempt(): () => void {
  return () => undefined
}

function getServerSnapshot(): null {
  return null
}
