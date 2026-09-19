import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  jobs?: Record<string, { permissions?: Record<string, string> }>
  permissions?: Record<string, string>
}

function workflow(name: string): Workflow {
  return load(readFileSync(`.github/workflows/${name}.yml`, 'utf8')) as Workflow
}

describe('main workflow permissions', () => {
  it('keeps Cloudflare Worker OIDC access on only the jobs that require it', () => {
    const main = workflow('main-cloudflare-worker')

    expect(main.permissions).toEqual({ contents: 'read' })
    expect(main.jobs?.['cloudflare-worker-tests']?.permissions).toEqual({
      actions: 'read',
      contents: 'read',
    })
    expect(main.jobs?.['publish-cloudflare-worker']?.permissions).toEqual({
      contents: 'read',
    })
    expect(main.jobs?.dispatch).toBeUndefined()
  })

  it('keeps Lambda OIDC access off the test job', () => {
    const main = workflow('main-lambdas')

    expect(main.permissions).toEqual({ contents: 'read' })
    expect(main.jobs?.['lambdas-tests']?.permissions).toEqual({
      actions: 'read',
      contents: 'read',
    })
    expect(main.jobs?.['publish-image-resize']?.permissions).toEqual({ contents: 'read' })
    expect(main.jobs?.dispatch).toBeUndefined()
  })
})
