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

describe('clean-workspace action wiring', () => {
  it('delegates directly to the published cleaner with Filaments-specific repair paths', () => {
    expect(action).toContain('preserve-node-modules:')
    expect(action).toContain('PRESERVE_NODE_MODULES: ${{ inputs.preserve-node-modules }}')
    expect(action).toContain('PR_AUTHOR: ${{ github.event.pull_request.user.login }}')
    expect(action).toContain('GENERATED_REPAIR_PATHS: >-')
    expect(action).toContain('web/.next cloudflare-worker/.wrangler')
    expect(action).toContain('${{ runner.temp }}/voucha-wrangler')
    expect(action).toContain('bash ci/exec-vouchington-gha.sh')
    expect(action).toContain('clean-workspace scripts/gha/clean-workspace.sh')
    expect(action).not.toContain('$GITHUB_ACTION_PATH/clean-workspace.sh')
  })

  it('keeps dependency preservation and Dependabot trust policy in tooling', () => {
    expect(packaged).toContain('[ "${PRESERVE_NODE_MODULES:-true}" = "true" ]')
    expect(packaged).toContain('is_dependabot_pr=false')
    expect(packaged).toContain('[ "${PR_AUTHOR:-}" = "dependabot[bot]" ]')
    expect(packaged).toContain(
      'if [ "${is_fork_pr}" = "false" ] && [ "${is_dependabot_pr}" = "false" ]; then',
    )
  })

  it('keeps sparse-state clearing and corruption-gated full-index recovery in tooling', () => {
    expect(packaged).toContain('clear_sparse_checkout_state')
    expect(packaged).toContain('git config --worktree --unset-all "${key}"')
    expect(packaged).toContain('git config --local --unset-all "${key}"')
    expect(packaged).toContain('index_requires_recovery()')
    expect(packaged).toContain('recover_full_index()')
    expect(packaged).toContain('[ "${reset_failed}" = "true" ] || index_requires_recovery')
    expect(packaged).toContain('Full workspace index recovery restored ${tracked_paths}')
  })
})
