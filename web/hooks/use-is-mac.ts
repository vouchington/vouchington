import { useSyncExternalStore } from 'react'

function subscribeToStaticSnapshot() {
  return () => {}
}

function getIsMacSnapshot() {
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
}

export function useIsMac(): boolean {
  return useSyncExternalStore(subscribeToStaticSnapshot, getIsMacSnapshot, () => false)
}
