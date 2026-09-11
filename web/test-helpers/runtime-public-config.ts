import type { RuntimePublicConfig } from '@/lib/runtime-public-config'

const RUNTIME_PUBLIC_CONFIG_KEY: keyof Window = '__VOUCHA_PUBLIC_CONFIG__'

export function setRuntimePublicConfigForTest(config: RuntimePublicConfig): void {
  Reflect.set(window, RUNTIME_PUBLIC_CONFIG_KEY, config)
}

export function clearRuntimePublicConfigForTest(): void {
  Reflect.deleteProperty(window, RUNTIME_PUBLIC_CONFIG_KEY)
}
