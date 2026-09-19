import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type Job = {
  if?: string
  needs?: string[]
  permissions?: Record<string, string>
  steps?: Step[]
}

type Workflow = {
  jobs?: Record<string, Job>
}

const workflow = load(
  readFileSync('.github/workflows/main-cloudflare-worker.yml', 'utf8'),
) as Workflow

describe('Main Cloudflare Worker workflow', () => {
  it('publishes one attempt-bound bundle only after both validation gates succeed', () => {
    const publish = workflow.jobs?.['publish-cloudflare-worker']

    expect(publish?.needs).toEqual(['static-checks', 'cloudflare-worker-tests'])
    expect(publish?.if).toContain("needs.static-checks.result == 'success'")
    expect(publish?.if).toContain("needs.cloudflare-worker-tests.result == 'success'")
    expect(publish?.permissions).toEqual({ contents: 'read' })

    const build = publish?.steps?.find(step =>
      step.name?.startsWith('Build and validate the Cloudflare Worker'),
    )
    expect(build?.run).toContain('"name": "credential-free-package-build"')
    expect(build?.run).toContain('"main": "src/index.mts"')
    expect(build?.run).toContain('"compatibility_flags": ["nodejs_compat"]')
    expect(build?.run).toContain('pnpm --dir cloudflare-worker exec wrangler deploy')
    expect(build?.run).toContain('--config cloudflare-worker-build.json')
    expect(build?.run).toContain('--dry-run --outdir')
    expect(build?.run).toContain('test -f "$output_dir/index.js"')
    expect(build?.run).toContain('find "$output_dir" -type l')
    expect(build?.run).toContain('! -type f ! -type d')
    expect(build?.run).toContain('mv "$output_dir" delivery/cloudflare-worker')
    expect(build?.run).not.toContain('CLOUDFLARE_API_TOKEN')
    expect(build?.run).not.toContain('CLOUDFLARE_ACCOUNT_ID')

    const upload = publish?.steps?.find(step => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload?.uses?.slice('actions/upload-artifact@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(upload?.with).toMatchObject({
      'if-no-files-found': 'error',
      name: 'cloudflare-worker-${{ github.run_id }}-${{ github.run_attempt }}',
      overwrite: true,
      path: 'delivery',
      'retention-days': 1,
    })
  })
})
