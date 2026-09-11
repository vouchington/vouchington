'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { isInputTarget } from '@/lib/keyboard-shortcuts'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

type Options = {
  isAuthenticated: boolean
  onOpenSearch: () => void
  onOpenShortcuts: () => void
  push: (url: string) => void
}

export function useNavbarKeyboardShortcuts({
  isAuthenticated,
  onOpenSearch,
  onOpenShortcuts,
  push,
}: Options) {
  // Keep refs updated via layout effect so handlers always see the latest props
  // without needing them as effect dependencies (avoids re-registering listeners).
  const onOpenSearchRef = useRef(onOpenSearch)
  const onOpenShortcutsRef = useRef(onOpenShortcuts)
  const isAuthenticatedRef = useRef(isAuthenticated)
  const pushRef = useRef(push)
  useIsomorphicLayoutEffect(() => {
    onOpenSearchRef.current = onOpenSearch
    onOpenShortcutsRef.current = onOpenShortcuts
    isAuthenticatedRef.current = isAuthenticated
    pushRef.current = push
  })

  // Cmd+K / Ctrl+K: open search (capture phase, runs before browser defaults)
  useIsomorphicLayoutEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenSearchRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  // Cmd+. / Ctrl+.: navigate to settings (authenticated users only)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        if (!isAuthenticatedRef.current) return
        e.preventDefault()
        pushRef.current('/my/preferences')
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  // ?: open keyboard shortcuts dialog (when not typing in an input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isInputTarget(e)) {
        onOpenShortcutsRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
