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
  permissions?: Record<string, string>
  'runs-on'?: string
  steps?: Step[]
  'timeout-minutes'?: number
}

type Workflow = {
  jobs?: Record<string, Job>
  on?: { push?: { branches?: string[]; paths?: string[] } }
  permissions?: Record<string, string>
}

const source = readFileSync('.github/workflows/docs-publish.yml', 'utf8')
const workflow = load(source) as Workflow

describe('Docs Publish workflow', () => {
  it('builds and uploads one trusted-main documentation delivery artifact', () => {
    expect(workflow.on?.push?.branches).toEqual(['main'])
    expect(workflow.permissions).toEqual({ contents: 'read' })

    const publish = workflow.jobs?.publish
    expect(publish).toMatchObject({
      permissions: { contents: 'read' },
      'runs-on': 'ubuntu-latest',
      'timeout-minutes': 10,
    })

    expect(workflow.on?.push?.paths).toEqual(
      expect.arrayContaining(['.github/actions/**', 'package.json', 'pnpm-lock.yaml']),
    )

    const checkout = publish?.steps?.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkout?.with).toMatchObject({
      'fetch-depth': 1,
      'persist-credentials': false,
      ref: '${{ github.sha }}',
    })

    const build = publish?.steps?.find(step => step.name === 'Build and validate documentation')
    expect(build?.run).toContain('pnpm exec redocly build-docs')
    expect(build?.run).toContain('delivery/docs/openapi/index.html')
    expect(build?.run).toContain('delivery/docs/openapi/openapi.json')
    expect(build?.run).toContain('--disableGoogleFont')
    expect(build?.run).toContain('node ci/render-psql-docs.mts delivery/docs/psql')
    expect(build?.run).toContain('delivery/docs/psql/index.html')
    expect(build?.run).toContain('delivery/docs/psql/schema.md')
    expect(build?.run).toContain('delivery/docs/psql/schema.json')
    expect(build?.run).toContain('find delivery -type l')
    expect(build?.run).toContain('find delivery ! -type f ! -type d')

    const upload = publish?.steps?.find(step => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload?.uses?.slice('actions/upload-artifact@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(upload?.with).toMatchObject({
      'if-no-files-found': 'error',
      name: 'docs-${{ github.run_id }}-${{ github.run_attempt }}',
      overwrite: true,
      path: 'delivery',
      'retention-days': 1,
    })

    expect(source).not.toMatch(/cloudflare|r2|aws|bucket|token|secret/iu)
    expect(source).not.toContain('delivery/docs/index.html')
  })
})
