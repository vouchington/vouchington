'use client'

import { useState, useEffect, useRef } from 'react'
import {
  recordMediaReveal,
  getExposureState,
  type RecordRevealBody,
} from '@/lib/api/client/moderation-exposure'
import onError from '@/lib/on-error'
import type { ExposureState } from '@/types/moderation-exposure'
import type { UseExposureCooldownReturn } from './use-exposure-cooldown.types'

export type { UseExposureCooldownReturn } from './use-exposure-cooldown.types'
const COOLDOWN_CONFIRMATION_INTERVAL_MS = 1000

/**
 * Tracks a moderator's disturbing-media exposure within the current session window.
 * Hydrates from the server on mount (so the pause survives a page reload).
 * Records each reveal via the API and fires a break prompt when the threshold is reached.
 */
export function useExposureCooldown(): UseExposureCooldownReturn {
  const [exposureState, setExposureState] = useState<ExposureState | null>(null)
  const [exposureStateIsStale, setExposureStateIsStale] = useState(true)
  const [revealPending, setRevealPending] = useState(false)
  const [showBreakPrompt, setShowBreakPrompt] = useState(false)
  const revealBlockedRef = useRef(true)
  const exposureRequestRevisionRef = useRef(0)
  const revealOutcomeRevisionRef = useRef(0)

  useEffect(() => {
    const requestRevision = ++exposureRequestRevisionRef.current
    const observedRevealOutcomeRevision = revealOutcomeRevisionRef.current
    getExposureState()
      .then(res => {
        if (
          requestRevision !== exposureRequestRevisionRef.current ||
          observedRevealOutcomeRevision !== revealOutcomeRevisionRef.current
        ) {
          return
        }
        setExposureState(res.exposure)
        setExposureStateIsStale(false)
        setShowBreakPrompt(res.exposure.in_cooldown)
        revealBlockedRef.current = res.exposure.in_cooldown
      })
      .catch((err: unknown) => {
        if (
          requestRevision !== exposureRequestRevisionRef.current ||
          observedRevealOutcomeRevision !== revealOutcomeRevisionRef.current
        ) {
          return
        }
        setExposureStateIsStale(true)
        revealBlockedRef.current = true
        onError(err, { fallback: 'Failed to load exposure state' })
      })
  }, [])

  useEffect(() => {
    const cooldownEndsAt = exposureState?.cooldown_ends_at
    const cooldownEndsAtMs = cooldownEndsAt ? new Date(cooldownEndsAt).getTime() : Number.NaN
    if (!exposureState?.in_cooldown || !Number.isFinite(cooldownEndsAtMs)) return undefined

    const lifetime = new AbortController()
    const confirmation = { pending: false, lastSettledAtMs: undefined as number | undefined }
    const confirmExpiredCooldown = () => {
      const now = Date.now()
      if (
        now < cooldownEndsAtMs ||
        confirmation.pending ||
        (confirmation.lastSettledAtMs !== undefined &&
          now - confirmation.lastSettledAtMs < COOLDOWN_CONFIRMATION_INTERVAL_MS)
      ) {
        return
      }
      confirmation.pending = true
      setExposureStateIsStale(true)
      revealBlockedRef.current = true
      const requestRevision = ++exposureRequestRevisionRef.current
      const observedRevealOutcomeRevision = revealOutcomeRevisionRef.current
      getExposureState()
        .then(res => {
          if (
            lifetime.signal.aborted ||
            requestRevision !== exposureRequestRevisionRef.current ||
            observedRevealOutcomeRevision !== revealOutcomeRevisionRef.current
          ) {
            return
          }
          setExposureState(res.exposure)
          setExposureStateIsStale(false)
          setShowBreakPrompt(res.exposure.in_cooldown)
          revealBlockedRef.current = res.exposure.in_cooldown
        })
        .catch((err: unknown) => {
          if (
            lifetime.signal.aborted ||
            requestRevision !== exposureRequestRevisionRef.current ||
            observedRevealOutcomeRevision !== revealOutcomeRevisionRef.current
          ) {
            return
          }
          setExposureStateIsStale(true)
          revealBlockedRef.current = true
          onError(err, { fallback: 'Failed to load exposure state' })
        })
        .finally(() => {
          confirmation.pending = false
          confirmation.lastSettledAtMs = Date.now()
        })
    }

    confirmExpiredCooldown()
    const intervalId = setInterval(confirmExpiredCooldown, COOLDOWN_CONFIRMATION_INTERVAL_MS)

    return () => {
      lifetime.abort()
      clearInterval(intervalId)
    }
  }, [exposureState?.cooldown_ends_at, exposureState?.in_cooldown])

  async function refreshExposureState() {
    const requestRevision = ++exposureRequestRevisionRef.current
    const observedRevealOutcomeRevision = revealOutcomeRevisionRef.current
    try {
      const res = await getExposureState()
      if (
        requestRevision !== exposureRequestRevisionRef.current ||
        observedRevealOutcomeRevision !== revealOutcomeRevisionRef.current
      ) {
        return
      }
      setExposureState(res.exposure)
      setExposureStateIsStale(false)
      setShowBreakPrompt(res.exposure.in_cooldown)
      revealBlockedRef.current = res.exposure.in_cooldown
    } catch (err) {
      if (
        requestRevision !== exposureRequestRevisionRef.current ||
        observedRevealOutcomeRevision !== revealOutcomeRevisionRef.current
      ) {
        return
      }
      setExposureStateIsStale(true)
      revealBlockedRef.current = true
      onError(err, { fallback: 'Failed to load exposure state' })
    }
  }

  function recordReveal(body: RecordRevealBody) {
    if (revealBlockedRef.current) return
    revealBlockedRef.current = true
    setRevealPending(true)
    ++exposureRequestRevisionRef.current

    recordMediaReveal(body)
      .then(res => {
        ++revealOutcomeRevisionRef.current
        setExposureState(res.exposure)
        setExposureStateIsStale(false)
        setShowBreakPrompt(res.exposure.in_cooldown)
        revealBlockedRef.current = res.exposure.in_cooldown
      })
      .catch((err: unknown) => {
        ++revealOutcomeRevisionRef.current
        setExposureStateIsStale(true)
        revealBlockedRef.current = true
        onError(err, { fallback: 'Failed to record reveal' })
        void refreshExposureState()
      })
      .finally(() => setRevealPending(false))
  }

  function dismissBreakPrompt() {
    const cooldownEndsAt = exposureState?.cooldown_ends_at
    const cooldownEndsAtMs = cooldownEndsAt ? new Date(cooldownEndsAt).getTime() : Number.NaN
    if (
      !exposureState?.in_cooldown ||
      !Number.isFinite(cooldownEndsAtMs) ||
      Date.now() < cooldownEndsAtMs
    ) {
      return
    }

    setExposureStateIsStale(true)
    revealBlockedRef.current = true
    void refreshExposureState()
  }

  return {
    exposureState,
    exposureStateIsStale,
    revealBlocked: exposureStateIsStale || revealPending || (exposureState?.in_cooldown ?? false),
    recordReveal,
    refreshExposureState,
    dismissBreakPrompt,
    showBreakPrompt,
  }
}
