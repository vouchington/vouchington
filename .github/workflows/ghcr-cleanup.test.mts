import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const source = readFileSync('.github/workflows/ghcr-cleanup.yml', 'utf8')
const workflow = parseYaml(source) as {
  jobs?: Record<
    string,
    {
      permissions?: Record<string, string>
      'runs-on'?: string
      steps?: Array<{
        env?: Record<string, string>
        if?: string
        name?: string
        run?: string
        uses?: string
        with?: Record<string, unknown>
      }>
    }
  >
}
const cleanup = workflow.jobs?.['cleanup']
const namedStep = (name: string) => cleanup?.steps?.find(step => step.name === name)

describe('GHCR retention workflow', () => {
  it('checks out explicit full-history main on a Docker-capable runner', () => {
    expect(cleanup?.['runs-on']).toBe('ubuntu-latest')
    expect(cleanup?.permissions).toEqual({ contents: 'read', packages: 'write' })
    const checkout = cleanup?.steps?.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkout?.with).toMatchObject({
      'fetch-depth': 0,
      'persist-credentials': false,
      ref: 'main',
    })
    const setup = cleanup?.steps?.find(step => step.uses?.startsWith('actions/setup-node@'))
    expect(setup).toMatchObject({
      with: { 'package-manager-cache': false },
    })
  })

  it('authenticates both registry clients and always removes Docker credentials', () => {
    expect(namedStep('Log in to GHCR')).toMatchObject({
      run: expect.stringContaining('docker login ghcr.io'),
    })
    const prune = namedStep('Prune published container package versions')
    expect(prune?.env).toMatchObject({
      GH_TOKEN: '${{ github.token }}',
      GHCR_PASSWORD: '${{ github.token }}',
      GHCR_USERNAME: '${{ github.actor }}',
    })
    expect(namedStep('Log out of GHCR')).toMatchObject({
      if: '${{ always() }}',
      run: expect.stringContaining('docker logout ghcr.io'),
    })
  })

  it('keeps the shell entrypoint thin and removes caller-controlled retention policy', () => {
    const script = readFileSync('ci/ghcr-package-retention.sh', 'utf8')
    expect(script).toContain('exec node ci/image-retention-cli.mts "$@"')
    expect(script).not.toMatch(/GHCR_(?:OWNER|PACKAGES|KEEP_TAGGED|UNTAGGED_MIN_AGE_DAYS)/u)
  })

  it('rejects a real CLI invocation without credentials without leaking environment values', () => {
    const secret = 'credential-body-secret'
    const result = spawnSync(process.execPath, ['ci/image-retention-cli.mts', '--dry-run'], {
      encoding: 'utf8',
      env: { PATH: process.env['PATH'], UNRELATED_SECRET: secret },
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('image retention credentials are missing')
    expect(result.stderr).not.toContain(secret)
  })
})
