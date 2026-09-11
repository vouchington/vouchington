import { useSyncExternalStore } from 'react'
import type { WebPushBinding } from '@/lib/push-service-worker'

let currentBinding: WebPushBinding | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function setCurrentBinding(nextBinding: WebPushBinding | null) {
  currentBinding = nextBinding
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return currentBinding
}

export function useCurrentPushBinding() {
  return {
    currentBinding: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    setCurrentBinding,
  }
}
