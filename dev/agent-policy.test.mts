import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import {
  extractPartialBatchSourceRef,
  hasRelatedIssuesNoSourcePair,
} from 'vouchington-tooling/pr-description'

import { renderNoSourceIssue, validatePullRequest } from './agent-policy.mts'
import {
  DIRECT_USER_REQUEST_NO_SOURCE_TEMPLATE,
  PARTIAL_BATCH_TEMPLATE,
  SCHEDULED_PROMPT_NO_SOURCE_TEMPLATE,
} from './pr-description/policy.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

describe('renderNoSourceIssue', () => {
  it.each([
    ['direct user request', DIRECT_USER_REQUEST_NO_SOURCE_TEMPLATE, ''],
    [
      'scheduled prompt run',
      SCHEDULED_PROMPT_NO_SOURCE_TEMPLATE,
      'Workspace setup: Triage loop scheduled prompt\n',
    ],
  ])('renders the %s pair the body policy accepts', (reason, template, setup) => {
    const body = `## Related issues\n\n${renderNoSourceIssue({ reason })}\n\n${setup}`
    expect(hasRelatedIssuesNoSourcePair(body, template)).toBe(true)
  })

  it('renders the partial batch after its refs entry as the source the body policy reads', () => {
    const statement = renderNoSourceIssue({ reason: 'partial batch' })
    const body = `## Related issues\n\n- Refs #123 — Batch plan; later batches finish it.\n${statement}\n\n## Details\n`
    expect(extractPartialBatchSourceRef(body, PARTIAL_BATCH_TEMPLATE)?.key).toBe('#123')
  })

  it('rejects any other reason before calling GitHub', async () => {
    const reason = 'cleanup'
    const body = `## Summary\n\nx\n\n## Related issues\n\n${renderNoSourceIssue({ reason })}\n`
    const { errors } = await validatePullRequest({
      title: 'chore: x',
      body,
      base: 'main',
      head: 'x',
      mode: 'interactive',
      noSourceIssue: { reason },
    })
    expect(errors).toContainEqual(
      expect.stringContaining('noSourceIssue.reason must be "direct user request" or'),
    )
  })
})

describe('child process contract', () => {
  it('validates a pull request that fails content policy without gh', () => {
    const runner = `
      import { readFileSync } from 'node:fs'
      const { validatePullRequest } = await import(process.argv[1])
      const request = JSON.parse(readFileSync(0, 'utf8'))
      process.stdout.write(JSON.stringify(await validatePullRequest(request)))
    `
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', runner, new URL('./agent-policy.mts', import.meta.url).href],
      {
        cwd: repoRoot,
        env: { HOME: process.env.HOME ?? '', PATH: '/usr/bin:/bin' },
        input: JSON.stringify({
          title: 't',
          body: '## Summary\n\nx\n',
          base: 'main',
          head: 'feature',
          mode: 'interactive',
        }),
        encoding: 'utf8',
      },
    )
    expect(child.stderr).toBe('')
    expect(child.status).toBe(0)
    expect(JSON.parse(child.stdout).errors.join('\n')).toContain('## Related issues')
  })
})
