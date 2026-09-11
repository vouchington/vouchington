import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const source = readFileSync('.github/actions/setup-node-pnpm/action.yml', 'utf8')
const activationHelper = readFileSync('ci/activate-pnpm.sh', 'utf8')
const action = load(source) as {
  inputs?: Record<string, { default?: string; required?: boolean }>
  runs?: { steps?: Array<{ name?: string; run?: string }> }
}

function step(name: string) {
  const found = action.runs?.steps?.find(candidate => candidate.name === name)
  if (!found) throw new Error(`Missing setup-node-pnpm step: ${name}`)
  return found
}

describe('setup-node-pnpm composite action', () => {
  it('requires an explicit runner lifecycle and exposes only structured install inputs', () => {
    expect(action.inputs).toEqual({
      'runner-lifecycle': {
        description: 'Runner filesystem lifecycle: persistent or ephemeral',
        required: true,
      },
      'install-scripts': {
        description: 'Set false when dependency lifecycle scripts are intentionally deferred',
        default: 'true',
      },
      'ephemeral-workspaces': {
        description: 'Newline-separated pnpm selectors; required only for ephemeral runners',
        default: '',
      },
    })
    for (const removed of [
      'force-install',
      'install-dependencies',
      'install-extra-args',
      'install-filters',
    ])
      expect(source).not.toContain(`${removed}:`)
  })

  it('activates the repository Node and pnpm versions without setup-node package caching', () => {
    expect(source).toContain("node-version-file: '.nvmrc'")
    expect(source).toContain('package-manager-cache: false')
    expect(step('Activate pnpm via corepack').run).toBe(
      'bash "$GITHUB_WORKSPACE/ci/activate-pnpm.sh"',
    )
    expect(activationHelper).toContain('pnpm_version=')
    expect(activationHelper).toContain('v26.*)')
    expect(activationHelper).toContain('GITHUB_PATH')
    expect(source).not.toContain('pnpm/action-setup')
  })

  it('installs pnpm into a per-job bin directory with an isolated npm fallback', () => {
    expect(activationHelper).toContain('pnpm_prefix="${RUNNER_TEMP:-$HOME/.local}/pnpm"')
    expect(activationHelper).toContain(
      '"${node_bin}/corepack" enable --install-directory "$pnpm_bin"',
    )
    expect(activationHelper).toContain(
      'cd "${RUNNER_TEMP:-/tmp}" && npm_config_userconfig=/dev/null npm install',
    )
    expect(activationHelper).toContain('echo "$pnpm_bin" >> "$GITHUB_PATH"')
  })

  it('delegates lifecycle validation and installation to the shared helper', () => {
    const install = step('pnpm install').run
    expect(install).toContain('bash "$GITHUB_WORKSPACE/ci/pnpm-install.sh"')
    expect(install).toContain('--runner-lifecycle "$RUNNER_LIFECYCLE"')
    expect(install).toContain('--install-scripts "$INSTALL_SCRIPTS"')
    expect(install).toContain('--ephemeral-workspaces "$EPHEMERAL_WORKSPACES"')
    expect(install).not.toContain('pnpm install')
    expect(install).not.toContain('--force')
    expect(install).not.toContain('--filter')
  })

  it('keeps the Node runtime dependency guard portable across CodeBuild and Ubicloud', () => {
    const runtime = step('Install Node runtime dependencies').run
    expect(runtime).toContain('command -v dnf')
    expect(runtime).toContain('dnf install -y libatomic')
  })
})
