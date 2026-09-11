'use client'

import { useSyncExternalStore } from 'react'

const subscribeToHydration = () => () => {}
const getHydratedSnapshot = () => true
const getServerHydratedSnapshot = () => false

export function useDidHydrate(): boolean {
  return useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerHydratedSnapshot)
}
