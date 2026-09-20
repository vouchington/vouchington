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

const source = readFileSync('.github/workflows/sync-articles.yml', 'utf8')
const workflow = load(source) as Workflow

describe('Sync Articles workflow', () => {
  it('produces one credential-free trusted-main article artifact', () => {
    expect(workflow.on?.push?.branches).toEqual(['main'])
    expect(Object.keys(workflow.on ?? {})).toEqual(['push'])
    expect(workflow.on?.push?.paths).toEqual(
      expect.arrayContaining([
        'articles/**',
        'backend/services/articles/**',
        '.github/workflows/sync-articles.yml',
      ]),
    )
    expect(workflow.permissions).toEqual({ contents: 'read' })

    const publish = workflow.jobs?.publish
    expect(publish).toMatchObject({
      permissions: { contents: 'read' },
      'runs-on': 'ubuntu-slim',
    })

    const checkout = publish?.steps?.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkout?.uses?.slice('actions/checkout@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(checkout?.with).toMatchObject({
      'fetch-depth': 1,
      'persist-credentials': false,
      ref: '${{ github.sha }}',
    })

    const packageDelivery = publish?.steps?.find(
      step => step.name === 'Package and validate article delivery',
    )
    expect(packageDelivery?.run).toContain('mkdir -p delivery/articles')
    expect(packageDelivery?.run).toContain(
      "find articles -maxdepth 1 -type f -name '*.md' ! -name 'README.md'",
    )
    expect(packageDelivery?.run).toContain('delivery/articles')
    expect(packageDelivery?.run).toContain('find articles -type l')
    expect(packageDelivery?.run).toContain('find articles ! -type f ! -type d')
    expect(packageDelivery?.run).toContain('find delivery/articles -type f -name')
    expect(packageDelivery?.run).toContain('Article delivery contains no Markdown files')
    expect(packageDelivery?.run).toContain('find delivery -type l')
    expect(packageDelivery?.run).toContain('find delivery ! -type f ! -type d')

    const upload = publish?.steps?.find(step => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload?.uses?.slice('actions/upload-artifact@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(upload?.with).toMatchObject({
      'if-no-files-found': 'error',
      name: 'articles-${{ github.run_id }}-${{ github.run_attempt }}',
      overwrite: true,
      path: 'delivery',
      'retention-days': 1,
    })

    expect(source).not.toMatch(/cloudflare|r2|aws|bucket|token|secret/iu)
  })
})
