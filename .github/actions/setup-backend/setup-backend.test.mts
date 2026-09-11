import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const source = readFileSync('.github/actions/setup-backend/action.yml', 'utf8')
const activationHelper = readFileSync('ci/activate-pnpm.sh', 'utf8')
const installHelper = readFileSync('ci/setup-backend-install.sh', 'utf8')
const action = load(source) as {
  inputs?: Record<string, { required?: boolean }>
  runs?: { steps?: Array<{ name?: string; run?: string; 'working-directory'?: string }> }
}

function step(name: string) {
  const found = action.runs?.steps?.find(candidate => candidate.name === name)
  if (!found) throw new Error(`Missing setup-backend step: ${name}`)
  return found
}

describe('setup-backend composite action', () => {
  it('requires the caller to declare the persistent runner lifecycle', () => {
    expect(action.inputs).toEqual({
      'runner-lifecycle': {
        description: 'Must be persistent; all setup-backend callers preserve node_modules',
        required: true,
      },
    })
    expect(source).not.toContain('extra-filters:')
    expect(source).not.toContain('force-install:')
  })

  it('activates repository Node and pnpm without setup-node package caching', () => {
    expect(source).toContain("node-version-file: '.nvmrc'")
    expect(source).toContain('package-manager-cache: false')
    expect(step('Activate pnpm via corepack').run).toBe(
      'bash "$GITHUB_WORKSPACE/ci/activate-pnpm.sh"',
    )
    expect(activationHelper).toContain('pnpm_version=')
    expect(activationHelper).toContain('v26.*)')
    expect(activationHelper).toContain('GITHUB_PATH')
    expect(activationHelper).toContain(
      'cd "${RUNNER_TEMP:-/tmp}" && npm_config_userconfig=/dev/null npm install',
    )
    expect(source).not.toContain('pnpm/action-setup')
  })

  it('rejects an ephemeral lifecycle before invoking the full-workspace helper', () => {
    const install = step('Install dependencies').run
    expect(install).toBe('bash "$GITHUB_WORKSPACE/ci/setup-backend-install.sh" "$RUNNER_LIFECYCLE"')
    expect(installHelper).toContain('setup-backend requires runner-lifecycle: persistent')
    expect(installHelper).toContain('bash "$GITHUB_WORKSPACE/ci/pnpm-install.sh"')
    expect(installHelper).toContain('--runner-lifecycle persistent')
    expect(installHelper).toContain('--install-scripts true')
    expect(installHelper).toContain('--command-timeout-seconds 0')
    expect(installHelper).not.toContain('--filter')
    expect(installHelper).not.toContain('--force')
  })

  it('builds email templates after dependency installation', () => {
    const build = step('Build email-templates')
    expect(build['working-directory']).toBe('email-templates')
    expect(build.run).toBe('pnpm run build')
    expect(source.indexOf('- name: Build email-templates')).toBeGreaterThan(
      source.indexOf('- name: Install dependencies'),
    )
  })
})
