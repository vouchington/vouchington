import { expect } from 'vitest'

export function isolatedHoldEnv(): NodeJS.ProcessEnv {
  return { ...process.env, GITHUB_ACTIONS: '' }
}

export function expectOutsideReservedSlice(ports: number[]): void {
  expect(ports.every(port => port < 2200 || port > 2999)).toBe(true)
}
