import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const action = readFileSync('.github/actions/clean-workspace/action.yml', 'utf8')
const packaged = readFileSync(
  join(
    dirname(require.resolve('vouchington-tooling/package.json')),
    'scripts/gha/clean-workspace.sh',
  ),
  'utf8',
)

describe('clean-workspace TypeScript cache cleanup', () => {
  it('injects Filaments generated repair paths into the published script', () => {
    expect(action).toContain('GENERATED_REPAIR_PATHS')
    expect(action).toContain('web/.next cloudflare-worker/.wrangler')
    expect(action).toContain('${{ runner.temp }}/voucha-wrangler')
    expect(action).toContain('exec-vouchington-gha.sh')
    expect(action).toContain('scripts/gha/clean-workspace.sh')
  })

  it('repairs stale generated output permissions before git clean', () => {
    const generatedRepair = packaged.indexOf('restore_user_directory_write_bits')
    const gitClean = packaged.indexOf('git clean -ffdx')
    expect(generatedRepair).toBeGreaterThanOrEqual(0)
    expect(generatedRepair).toBeLessThan(gitClean)
    expect(packaged).toContain('GENERATED_REPAIR_PATHS')
    expect(packaged).not.toContain('find web/.next -type f -exec chmod u+rw {} +')
  })

  it('removes stale incremental build info after selective clean', () => {
    const gitClean = packaged.indexOf('git clean -ffdx')
    const cacheClean = packaged.indexOf("path '*/node_modules/.cache'")
    const sentinel = packaged.indexOf('touch "${SENTINEL}"')
    expect(gitClean).toBeGreaterThanOrEqual(0)
    expect(cacheClean).toBeGreaterThan(gitClean)
    expect(cacheClean).toBeLessThan(sentinel)
    expect(packaged).toContain('tsbuildinfo')
  })

  it('restores directory write bits in stale generated trees without traversing symlinks', () => {
    expect(packaged).toContain('restore_user_directory_write_bits()')
    expect(packaged).toContain('generated_repair_paths+=("${RUNNER_TEMP}/wrangler-logs")')
    expect(packaged).toContain('find -P "${path}" -xdev')
    expect(packaged).toContain('-type d -exec chmod u+rwx {} +')
    expect(packaged).not.toContain('-type f -exec chmod u+rw {} +')
  })

  it('reclaims stale root-owned generated directories with non-interactive sudo when available', () => {
    expect(packaged).toContain('sudo -n true')
    expect(packaged).toContain(
      'sudo -n find -P "${path}" -xdev -type d -exec chown -h "$(id -u):$(id -g)" {} +',
    )
  })

  it('retries git clean after workspace repair without touching git metadata', () => {
    expect(packaged).toContain('restore_workspace_write_bits()')
    expect(packaged).toContain(
      'sudo -n find -P . -xdev -path ./.git -prune -o -type d -exec chown -h "$(id -u):$(id -g)" {} +',
    )
    expect(packaged).toContain(
      'find -P . -xdev -path ./.git -prune -o -type d -exec chmod u+rwx {} +',
    )
    expect(packaged).toContain('git clean failed after targeted repair')
    expect(packaged).toContain('retrying git clean with the repaired subset')
  })

  it('repairs every preserved node_modules directory', () => {
    expect(packaged).toContain(
      'find -P . -xdev -path ./.git -prune -o -type d -name node_modules -print -prune',
    )
    expect(packaged).toContain('generated_repair_paths+=("${path}")')
  })
})
