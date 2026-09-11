'use client'

import { useSyncExternalStore } from 'react'
import { createMembershipRefund } from '@/lib/api/client/memberships'
import { chargeKey } from './membership-refund-charge-key.ts'
import type { MembershipRefundFormState } from './membership-refund-form.types.ts'
import type { RefundRequest } from './membership-refund-request.ts'
import type { RefundableCharge } from '@/types/api-responses'
import { isMoney } from '@ts-shared/money'
import { majorUnitsInputValue } from '@/lib/money'

const STORAGE_KEY_PREFIX = 'voucha:membership-refund-attempt:v2:'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REFUND_REASONS = new Set(['goodwill', 'requested', 'dispute', 'other'])

export type MembershipRefundAttempt = {
  actorUserId: string
  request: RefundRequest
  requestFingerprint: string
  idempotencyKey: string
  cancellationPending: boolean
}

export type MembershipRefundAttemptScope = {
  actorUserId: string
  targetUserId: string
}

export function prepareMembershipRefundAttempt(
  scope: MembershipRefundAttemptScope,
  current: MembershipRefundAttempt | null,
  request: RefundRequest,
  cancellationPending: boolean,
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
    cancellationPending,
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
): MembershipRefundAttempt {
  const pendingAttempt = { ...attempt, cancellationPending: true }
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
    // The live attempt remains authoritative for this mounted form.
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
      // Terminal in-memory cleanup must not depend on browser storage availability.
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
  const charge = charges.find(candidate => matchesRequest(candidate, attempt.request))
  if (!charge) return null
  return {
    attempt,
    selectedChargeKey: chargeKey(charge),
    formState: {
      reason: attempt.request.reason,
      cancel: attempt.request.cancel,
      amountStr: attempt.request.amount ? majorUnitsInputValue(attempt.request.amount) : '',
      note: attempt.request.note ?? '',
    } satisfies MembershipRefundFormState,
    isCancellationPending: attempt.cancellationPending,
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
  if (typeof value.cancellationPending !== 'boolean') return false
  return !value.cancellationPending || value.request.cancel
}

function isRefundRequest(value: unknown, userId: string): value is RefundRequest {
  if (!isObject(value) || value.user_id !== userId) return false
  if (!isNullableString(value.charge_id) || !isNullableString(value.payment_intent_id)) return false
  if (!value.charge_id && !value.payment_intent_id) return false
  if (typeof value.invoice_id !== 'string' || !value.invoice_id) return false
  if (typeof value.reason !== 'string' || !REFUND_REASONS.has(value.reason)) return false
  if (typeof value.cancel !== 'boolean') return false
  if (
    value.amount !== undefined &&
    (!isMoney(value.amount) || (value.amount as { amount: number }).amount <= 0)
  ) {
    return false
  }
  return value.note === null || value.note === undefined || typeof value.note === 'string'
}

function matchesRequest(charge: RefundableCharge, request: RefundRequest): boolean {
  return (
    charge.charge_id === request.charge_id &&
    charge.payment_intent_id === request.payment_intent_id &&
    charge.invoice_id === request.invoice_id
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
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
