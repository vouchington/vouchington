'use client'

import { useCallback, useMemo, useRef, type ReactNode } from 'react'
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
  const entriesRef = useRef<Map<string, VoteEntry>>(new Map())
  const listenersRef = useRef<Map<string, Set<Listener>>>(new Map())
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
  const getEntry = useCallback((entityType: VoteEntityType, electionId: string) => {
    return entriesRef.current.get(makeVoteKey(entityType, electionId))
  }, [])
  const hydrate = useCallback(
    (entityType: VoteEntityType, electionId: string, entry: VoteEntry) => {
      const key = makeVoteKey(entityType, electionId)
      if (entriesRef.current.has(key)) return
      entriesRef.current.set(key, entry)
      notify(key)
    },
    [notify],
  )
  const applyOptimistic = useCallback(
    (entityType: VoteEntityType, electionId: string, nextVote: VoteChoice) => {
      const key = makeVoteKey(entityType, electionId)
      const prev = entriesRef.current.get(key)
      if (!prev) return () => {}
      const next = nextEntryFor(prev, nextVote)
      entriesRef.current.set(key, next)
      notify(key)
      return () => {
        if (entriesRef.current.get(key) !== next) return
        entriesRef.current.set(key, prev)
        notify(key)
      }
    },
    [notify],
  )
  const value = useMemo<VoteStore>(
    () => ({ hydrate, getEntry, applyOptimistic, subscribe }),
    [hydrate, getEntry, applyOptimistic, subscribe],
  )
  return <VoteStoreContext.Provider value={value}>{children}</VoteStoreContext.Provider>
}
