import { vi } from 'vitest'

export async function reloadValkeyAppIntegration(): Promise<void> {
  vi.resetModules()
  await import('../data-stores/valkey-core/app-integration.mts')
}
