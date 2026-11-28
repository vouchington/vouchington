import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  jobs?: Record<string, { permissions?: Record<string, string> }>
}

const workflow = load(
  readFileSync('.github/workflows/main-cloudflare-worker.yml', 'utf8'),
) as Workflow
const buildScript = readFileSync('.github/workflows/main-cloudflare-worker/build.sh', 'utf8')

describe('Main Cloudflare Worker workflow', () => {
  it('builds the worker without Cloudflare credentials', () => {
    expect(workflow.jobs?.['publish-cloudflare-worker']?.permissions).toEqual({ contents: 'read' })
    expect(buildScript).not.toContain('CLOUDFLARE_API_TOKEN')
    expect(buildScript).not.toContain('CLOUDFLARE_ACCOUNT_ID')
  })
})
