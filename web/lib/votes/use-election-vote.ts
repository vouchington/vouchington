'use client'

import { use, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useOptionalAuth } from '@/lib/auth/context'
import {
  nextEntryFor,
  makeVoteKey,
  VoteStoreContext,
  type Listener,
  type VoteChoice,
  type VoteEntityType,
  type VoteEntry,
} from './store'
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

interface UseElectionVoteOptions<TChoice extends Exclude<VoteChoice, null>> {
  initialVote: TChoice | null
  initialCountUp: number
  initialCountDown: number
  submitVote: (choice: TChoice) => Promise<void>
  clearVote: () => Promise<void>
  disabled?: boolean
  onError?: (err?: unknown) => void
}

export interface UseElectionVoteResult<TChoice extends Exclude<VoteChoice, null>> {
  currentVote: TChoice | null
  countUp: number
  countDown: number
  isLoading: boolean
  handleVote: (choice: TChoice) => Promise<void>
  handleClear: () => Promise<void>
}

export function useElectionVote<TChoice extends Exclude<VoteChoice, null>>(
  entityType: VoteEntityType,
  electionId: string,
  options: UseElectionVoteOptions<TChoice>,
): UseElectionVoteResult<TChoice> {
  const store = use(VoteStoreContext)
  const emailRecovery = useEmailVerificationRecovery()
  const viewerId = useOptionalAuth()?.currentUser?.id ?? null
  const propsEntry = useMemo<VoteEntry>(
    () => ({
      currentVote: options.initialVote,
      countUp: options.initialCountUp,
      countDown: options.initialCountDown,
    }),
    [options.initialVote, options.initialCountUp, options.initialCountDown],
  )
  const electionKey = useMemo(() => makeVoteKey(entityType, electionId), [entityType, electionId])
  const localKey = `${viewerId ?? ''}:${electionKey}`
  const [localEntry, setLocalEntry] = useState({ key: localKey, value: propsEntry })
  const currentLocalEntry = localEntry.key === localKey ? localEntry.value : propsEntry
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const isLoading = pendingKey === localKey
  useEffect(() => {
    store?.hydrate(entityType, electionId, propsEntry)
  }, [store, entityType, electionId, propsEntry])

  const subscribe = useCallback(
    (listener: Listener) => store?.subscribe(entityType, electionId, listener) ?? (() => {}),
    [store, entityType, electionId],
  )
  const getSnapshot = useCallback(
    () => store?.getEntry(entityType, electionId) ?? currentLocalEntry,
    [store, entityType, electionId, currentLocalEntry],
  )
  const entry = useSyncExternalStore(subscribe, getSnapshot, () => propsEntry)
  const mutate = useCallback(
    async (next: TChoice | null) => {
      if (options.disabled || isLoading || next === entry.currentVote) return

      const requestKey = localKey
      const rollback = store?.applyOptimistic(entityType, electionId, next)
      const optimisticEntry = store ? undefined : nextEntryFor(entry, next)
      if (optimisticEntry) setLocalEntry({ key: requestKey, value: optimisticEntry })

      setPendingKey(requestKey)
      try {
        if (next === null) await options.clearVote()
        else await options.submitVote(next)
      } catch (err) {
        rollback?.()
        if (optimisticEntry) setLocalEntry({ key: requestKey, value: entry })
        if (isEmailVerificationRequired(err)) emailRecovery?.openEmailVerificationRecovery()
        else options.onError?.(err)
      } finally {
        setPendingKey(current => (current === requestKey ? null : current))
      }
    },
    [options, isLoading, entry, store, entityType, electionId, localKey, emailRecovery],
  )

  return {
    currentVote: entry.currentVote as TChoice | null,
    countUp: entry.countUp,
    countDown: entry.countDown,
    isLoading,
    handleVote: choice => mutate(choice),
    handleClear: () => mutate(null),
  }
}
