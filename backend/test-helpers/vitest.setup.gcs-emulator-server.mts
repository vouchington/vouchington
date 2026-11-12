import { startGcsEmulator, type RunningGcsEmulator } from './gcs-emulator.mts'

declare module 'vitest' {
  export interface ProvidedContext {
    gcsEmulator: { endpoint: string }
  }
}

type SharedEmulator = { started: Promise<RunningGcsEmulator>; users: number }
const key = Symbol.for('voucha.test.gcsEmulator')
const shared = globalThis as typeof globalThis & { [key]?: SharedEmulator }

export async function setup({
  provide,
}: {
  provide: (key: 'gcsEmulator', value: { endpoint: string }) => void
}): Promise<void> {
  shared[key] ??= { started: startGcsEmulator(), users: 0 }
  const entry = shared[key]
  entry.users++
  const { endpoint } = await entry.started
  provide('gcsEmulator', { endpoint })
}

export async function teardown(): Promise<void> {
  const entry = shared[key]
  if (!entry || --entry.users > 0) return
  shared[key] = undefined
  await (await entry.started).stop()
}
