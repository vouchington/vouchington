import { describe, expect, it } from 'vitest'

import { runsPnpmInstall } from './workflow-cache-pnpm-parsing.mts'

describe('pnpm install shell recognition', () => {
  it('recognizes the original pnpm install shell examples', () => {
    expect([
      runsPnpmInstall('timeout 120 pnpm install --frozen-lockfile'),
      runsPnpmInstall('CI=1 pnpm \\\n  install --frozen-lockfile'),
      runsPnpmInstall('pnpm --dir package install'),
      runsPnpmInstall('pnpm --config.foo=bar install'),
      runsPnpmInstall('pnpm -C package i'),
      runsPnpmInstall('# pnpm install is documented, not executed'),
      runsPnpmInstall('pnpm exec playwright install chromium'),
      runsPnpmInstall('pnpm --filter web exec playwright install'),
    ]).toEqual([true, true, true, true, true, false, false, false])
  })
})
