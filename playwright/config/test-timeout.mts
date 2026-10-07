import type { FullConfig, PlaywrightTestConfig } from '@playwright/test'

const MAX_PLAYWRIGHT_TEST_TIMEOUT_MS = 30_000

export function playwrightTestTimeout(timeout: number, label: string): number {
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > MAX_PLAYWRIGHT_TEST_TIMEOUT_MS) {
    throw new RangeError(`${label} must be a positive finite number at most 30,000 ms`)
  }
  return timeout
}

export function validatePlaywrightConfigTimeouts(
  config: PlaywrightTestConfig,
): PlaywrightTestConfig {
  if (config.timeout !== undefined) playwrightTestTimeout(config.timeout, 'Playwright test timeout')
  for (const project of config.projects ?? []) {
    if (project.timeout !== undefined) {
      playwrightTestTimeout(project.timeout, `Playwright project ${project.name} timeout`)
    }
  }
  return config
}

export function assertResolvedPlaywrightTimeouts(config: Pick<FullConfig, 'projects'>): void {
  for (const project of config.projects) {
    playwrightTestTimeout(project.timeout, `Playwright project ${project.name} effective timeout`)
  }
}
