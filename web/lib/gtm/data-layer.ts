import type { DataLayerEntry } from './types'

declare global {
  interface Window {
    dataLayer?: DataLayerEntry[]
  }
}

export function pushEvent(entry: DataLayerEntry): void {
  if (typeof window === 'undefined') return
  window.dataLayer ??= []
  window.dataLayer.push(entry)
}
