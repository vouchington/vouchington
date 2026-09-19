import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const action = readFileSync('.github/actions/setup-playwright/action.yml', 'utf8')

describe('setup-playwright action', () => {
  it('repairs missing system dependencies directly and skips that path when healthy', () => {
    const dryRun = 'pnpm exec playwright install-deps --dry-run chromium'
    const dependencyInstall = 'pnpm exec playwright install-deps chromium'
    const browserInstall = 'pnpm exec playwright install chromium'
    const repair = `${dryRun} || ${dependencyInstall}`

    expect(action).toContain(`if ${dryRun} > /dev/null 2>&1; then`)
    expect(action).toContain(repair)
    const dryRunCount = action.split(dryRun).length - 1
    expect(dryRunCount).toBe(2)
    expect(action).toContain('ci/wait-for-apt-locks.sh')
    expect(action.indexOf(dryRun)).toBeLessThan(action.indexOf('ci/wait-for-apt-locks.sh'))
    expect(action.indexOf('ci/wait-for-apt-locks.sh')).toBeLessThan(action.indexOf(repair))
    expect(action).toMatch(/install-deps chromium\n\s+fi\n\s+pnpm exec playwright install chromium/)
    expect(action.match(new RegExp(browserInstall, 'g'))).toHaveLength(1)
    expect(action).not.toContain('--with-deps')
    // Residual guards: the shared host lock and the Ubicloud ARM64 curl/unzip branch were removed
    // once GitHub-hosted runners stopped sharing a host across concurrent jobs (each job now gets
    // its own single-use VM, so there is no longer any package-manager contention to serialize).
    expect(action).not.toContain('with-host-lock.sh')
    expect(action).not.toContain('host_lock_timeout_seconds')
    expect(action).not.toContain('ubicloud')
  })
})
