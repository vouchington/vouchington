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
  it('exposes no lifecycle inputs', () => {
    expect(action.inputs ?? {}).toEqual({})
    for (const removed of [
      'runner-lifecycle',
      'ephemeral-workspaces',
      'extra-filters',
      'force-install',
    ])
      expect(source).not.toContain(`${removed}:`)
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

  it('invokes the full-workspace helper as an unconditional full install', () => {
    const install = step('Install dependencies').run
    expect(install).toBe('bash "$GITHUB_WORKSPACE/ci/setup-backend-install.sh"')
    expect(installHelper).toContain('bash "$GITHUB_WORKSPACE/ci/pnpm-install.sh"')
    expect(installHelper).toContain('--runner-lifecycle ephemeral-full')
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
