'use client'

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useOptionalAuth } from '@/lib/auth/context'
import {
  makeVoteKey,
  nextEntryFor,
  VoteStoreContext,
  type Listener,
  type VoteEntityType,
  type VoteEntry,
  type VoteChoice,
  type VoteStore,
} from './store'

export function VoteStoreProvider({ children }: { children: ReactNode }) {
  const viewerId = useOptionalAuth()?.currentUser?.id ?? null
  const entriesRef = useRef<Map<string, { epoch: number; entry: VoteEntry }>>(new Map())
  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map())
  // Epoch advances when the signed-in account changes so a previous viewer's vote
  // cannot satisfy hydration for the account now on screen.
  const [viewerEpoch, setViewerEpoch] = useState({ viewerId, epoch: 0 })
  if (viewerEpoch.viewerId !== viewerId) {
    setViewerEpoch({ viewerId, epoch: viewerEpoch.epoch + 1 })
  }
  const epoch = viewerEpoch.viewerId === viewerId ? viewerEpoch.epoch : viewerEpoch.epoch + 1
  const notify = useCallback((key: string) => {
    const listeners = listenersRef.current.get(key)
    if (!listeners) return
    for (const listener of listeners) listener()
  }, [])
  const subscribe = useCallback(
    (entityType: VoteEntityType, electionId: string, listener: Listener) => {
      const key = makeVoteKey(entityType, electionId)
      let listeners = listenersRef.current.get(key)
      if (!listeners) {
        listeners = new Set()
        listenersRef.current.set(key, listeners)
      }
      listeners.add(listener)
      return () => {
        const set = listenersRef.current.get(key)
        if (!set) return
        set.delete(listener)
        if (set.size === 0) listenersRef.current.delete(key)
      }
    },
    [],
  )
  const getEntry = useCallback(
    (entityType: VoteEntityType, electionId: string) => {
      const stored = entriesRef.current.get(makeVoteKey(entityType, electionId))
      if (!stored || stored.epoch !== epoch) return undefined
      return stored.entry
    },
    [epoch],
  )
  const hydrate = useCallback(
    (entityType: VoteEntityType, electionId: string, entry: VoteEntry) => {
      const key = makeVoteKey(entityType, electionId)
      const stored = entriesRef.current.get(key)
      if (stored?.epoch === epoch) return
      entriesRef.current.set(key, { epoch, entry })
      notify(key)
    },
    [epoch, notify],
  )
  const applyOptimistic = useCallback(
    (entityType: VoteEntityType, electionId: string, nextVote: VoteChoice) => {
      const key = makeVoteKey(entityType, electionId)
      const stored = entriesRef.current.get(key)
      if (!stored || stored.epoch !== epoch) return () => {}
      const next = { epoch, entry: nextEntryFor(stored.entry, nextVote) }
      entriesRef.current.set(key, next)
      notify(key)
      return () => {
        if (entriesRef.current.get(key) !== next) return
        entriesRef.current.set(key, stored)
        notify(key)
      }
    },
    [epoch, notify],
  )
  const value = useMemo<VoteStore>(
    () => ({ hydrate, getEntry, applyOptimistic, subscribe }),
    [hydrate, getEntry, applyOptimistic, subscribe],
  )
  return <VoteStoreContext.Provider value={value}>{children}</VoteStoreContext.Provider>
}
