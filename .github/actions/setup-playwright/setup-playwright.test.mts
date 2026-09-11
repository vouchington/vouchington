import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const action = readFileSync('.github/actions/setup-playwright/action.yml', 'utf8')
const ubicloudScript = readFileSync('ci/playwright-install-ubicloud-browsers.sh', 'utf8')
const packaged = readFileSync(
  'node_modules/vouchington-tooling/scripts/gha/install-playwright-chromium-arm64.sh',
  'utf8',
)

describe('setup-playwright action', () => {
  it('delegates the Ubicloud browser install to a lintable CI script', () => {
    expect(action).toContain('run: ./ci/playwright-install-ubicloud-browsers.sh')
    expect(ubicloudScript).toContain('exec-vouchington-gha.sh')
    expect(ubicloudScript).toContain('install-playwright-chromium-arm64')
    expect(packaged).toContain('install_browser chromium chromium-linux-arm64.zip')
    expect(packaged).toContain(
      'install_browser chromium-headless-shell chromium-headless-shell-linux-arm64.zip',
    )
  })

  it('repairs missing system dependencies under the host lock and skips that path when healthy', () => {
    const dryRun = 'pnpm exec playwright install-deps --dry-run chromium'
    const dependencyInstall = 'pnpm exec playwright install-deps chromium'
    const browserInstall = 'pnpm exec playwright install chromium'
    const lockedRepair = `bash -c '${dryRun} || ${dependencyInstall}'`
    const driftBranchStart = action.indexOf(`if ${dryRun}`)
    const driftBranch = action.slice(
      driftBranchStart,
      action.indexOf('\n        fi\n', driftBranchStart),
    )

    expect(action).toContain(`if ${dryRun} > /dev/null 2>&1; then`)
    expect(action).toContain(`-- ${lockedRepair}`)
    const dryRunCount = action.split(dryRun).length - 1
    expect(dryRunCount).toBe(2)
    expect(action).toContain('$GITHUB_WORKSPACE/ci/with-host-lock.sh')
    expect(action).toContain('--name host-package-manager')
    expect(action).toContain('--timeout-seconds "$host_lock_timeout_seconds"')
    expect(action).toContain('ci/wait-for-apt-locks.sh')
    expect(driftBranch).toContain('ci/wait-for-apt-locks.sh')
    expect(driftBranch).toContain('$GITHUB_WORKSPACE/ci/with-host-lock.sh')
    expect(action).toMatch(/host_lock_timeout_seconds=\d+/)
    expect(action).toContain('[ "${GITHUB_JOB:-}" = "storybook" ]')
    expect(action).toContain('[ "${GITHUB_WORKFLOW:-}" = "Storybook" ]')
    expect(action).toMatch(/GITHUB_JOB.*storybook.*host_lock_timeout_seconds=\d+/s)
    expect(action.indexOf(dryRun)).toBeLessThan(action.indexOf('ci/wait-for-apt-locks.sh'))
    expect(action.indexOf('ci/wait-for-apt-locks.sh')).toBeLessThan(
      action.indexOf('$GITHUB_WORKSPACE/ci/with-host-lock.sh'),
    )
    expect(action.indexOf('$GITHUB_WORKSPACE/ci/with-host-lock.sh')).toBeLessThan(
      action.indexOf(lockedRepair),
    )
    expect(action).toMatch(
      /install-deps chromium'\n\s+fi\n\s+pnpm exec playwright install chromium/,
    )
    expect(action.match(new RegExp(browserInstall, 'g'))).toHaveLength(1)
    expect(action).not.toContain('--with-deps')
    expect(action).not.toContain('mkdir "$lock_dir"')
  })
})
