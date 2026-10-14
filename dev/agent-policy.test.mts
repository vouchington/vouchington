import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { UNASSESSED_RETROSPECTIVE_SECTIONS } from './test-helpers/blackboard/retrospective-sections.mts'
import {
  pullRequestDefaults,
  validateRetrospective,
  type RetrospectivePolicyInput,
} from './agent-policy.mts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const SESSION_ID = 'f5413927-eec3-4204-90c6-4f81b6a413e4'
const COVERAGE = { status: 'partial', sources: [], droppedCount: 0 }

const BODY = `
# Retrospective: sample

## Verifiable Facts

=== Retrospective Facts ===
facts

## Transcript Facts

=== Transcript Facts ===
facts

## CI Failures

Status: none observed
${UNASSESSED_RETROSPECTIVE_SECTIONS}`

function doc(frontMatter: string[] = []): string {
  return ['---', 'date: "2026-10-12"', 'issues: []', 'prs: []', ...frontMatter, '---', BODY].join(
    '\n',
  )
}

function input(markdown: string, overrides: Partial<RetrospectivePolicyInput> = {}) {
  return {
    sessionId: SESSION_ID,
    parentSessionId: null,
    mode: 'interactive',
    workOutcome: 'success',
    feedbackCoverage: COVERAGE,
    repositories: ['vouchington/vouchington'],
    markdown,
    sourceEventId: 'retrospective-1',
    metadata: { date: '2026-10-12', issues: [], prs: [], description: null },
    ...overrides,
  } satisfies RetrospectivePolicyInput
}

describe('validateRetrospective', () => {
  it('accepts a valid retrospective', () => {
    expect(validateRetrospective(input(doc()))).toEqual({ errors: [] })
  })

  it('rejects a missing required section', () => {
    const markdown = doc().replace('## Transcript Facts', '## Other')
    const { errors } = validateRetrospective(input(markdown))
    expect(errors).toContain('missing "## Transcript Facts" section header')
  })

  it('rejects bad front matter', () => {
    const { errors } = validateRetrospective(input(doc().replace('date: "2026-10-12"\n', '')))
    expect(errors).toEqual([expect.stringContaining('missing a non-empty "date" field')])
  })

  it('rejects plain YAML front matter values', () => {
    const { errors } = validateRetrospective(
      input(doc().replace('date: "2026-10-12"', 'date: 2026-10-12')),
    )
    expect(errors).toEqual([expect.stringContaining('"date" is not a JSON value')])
  })

  it('rejects a front matter line that is not key: value', () => {
    const { errors } = validateRetrospective(input(doc(['- block-list'])))
    expect(errors).toEqual([expect.stringContaining('is not "key: <JSON value>"')])
  })

  it('accepts CRLF front matter', () => {
    expect(validateRetrospective(input(doc().replace(/\n/g, '\r\n')))).toEqual({ errors: [] })
  })

  it.each([
    ['work_outcome: "success"', 'both work_outcome and feedback_coverage'],
    ['session_id: ""', '"session_id" field must be a non-empty string'],
    ['session_id: "bad id"', '"session_id" field must be a valid session id'],
  ])('rejects front matter %s', (line, message) => {
    const { errors } = validateRetrospective(input(doc([line])))
    expect(errors).toEqual([expect.stringContaining(message)])
  })

  it('rejects an invalid reference', () => {
    const { errors } = validateRetrospective(input(doc().replace('prs: []', 'prs: [0]')))
    expect(errors).toEqual([expect.stringContaining('references must be positive integers')])
  })

  it('accepts paired generated metadata and a session id', () => {
    const lines = [
      `session_id: "${SESSION_ID}"`,
      'work_outcome: "success"',
      'feedback_coverage: {"status":"partial","sources":[],"droppedCount":0}',
    ]
    expect(validateRetrospective(input(doc(lines)))).toEqual({ errors: [] })
  })

  it('rejects a missing front-matter block', () => {
    const { errors } = validateRetrospective(input(BODY))
    expect(errors).toEqual([expect.stringContaining('missing a front-matter block')])
  })

  it('rejects a CI failure-grammar violation', () => {
    const markdown = doc().replace('Status: none observed', 'Status: failures observed')
    const { errors } = validateRetrospective(input(markdown))
    expect(errors).toContain(
      '"Status: failures observed" requires at least one failure-group entry',
    )
  })

  it('rejects an assessment without a status', () => {
    const markdown = doc().replace(/Status: not assessed \(tool[^\n]*\n/, '')
    const { errors } = validateRetrospective(input(markdown))
    expect(errors).toContain('## Tool Findings requires exactly one assessment status')
  })

  it.each([
    ['Tool Findings', 'Status: not assessed (tool assessment unavailable in this fixture)'],
    [
      'Architecture Findings',
      'Status: not assessed (architecture assessment unavailable in this fixture)',
    ],
  ])('accepts complete coverage once %s is assessed', (_section, status) => {
    const markdown = doc()
      .replace(
        'Status: not assessed (tool assessment unavailable in this fixture)',
        'Status: none observed (inspected scope)',
      )
      .replace(
        'Status: not assessed (architecture assessment unavailable in this fixture)',
        'Status: none observed (inspected scope)',
      )
    const partial = markdown.replace('Status: none observed (inspected scope)', status)
    const complete = { ...COVERAGE, status: 'complete' }
    expect(validateRetrospective(input(markdown, { feedbackCoverage: complete }))).toEqual({
      errors: [],
    })
    expect(validateRetrospective(input(partial, { feedbackCoverage: complete })).errors).toContain(
      'complete feedback coverage requires available assessed factual, tool, and architecture sources',
    )
  })

  it.each(['Tool Findings', 'Architecture Findings'])(
    'rejects complete coverage when %s is missing',
    heading => {
      const markdown = doc().replace(`## ${heading}`, '## Other Findings')
      const { errors } = validateRetrospective(
        input(markdown, { feedbackCoverage: { ...COVERAGE, status: 'complete' } }),
      )
      expect(errors).toContain(
        'complete feedback coverage requires available assessed factual, tool, and architecture sources',
      )
    },
  )

  it('rejects complete coverage when an assessment was not performed', () => {
    const { errors } = validateRetrospective(
      input(doc(), { feedbackCoverage: { ...COVERAGE, status: 'complete' } }),
    )
    expect(errors).toEqual([
      'complete feedback coverage requires available assessed factual, tool, and architecture sources',
    ])
  })
})

describe('pullRequestDefaults', () => {
  it('returns the Vouchington repository', () => {
    expect(pullRequestDefaults()).toEqual({ repositories: ['vouchington/vouchington'] })
  })
})

describe('child process contract', () => {
  it('runs under plain node with only HOME and PATH', () => {
    const runner = `
      import { readFileSync } from 'node:fs'
      const { validateRetrospective } = await import(process.argv[1])
      const request = JSON.parse(readFileSync(0, 'utf8'))
      process.stdout.write(JSON.stringify(await validateRetrospective(request)))
    `
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', runner, new URL('./agent-policy.mts', import.meta.url).href],
      {
        cwd: repoRoot,
        env: { HOME: process.env.HOME ?? '', PATH: '/usr/bin:/bin' },
        input: JSON.stringify(input(doc())),
        encoding: 'utf8',
      },
    )
    expect(child.stderr).toBe('')
    expect(child.status).toBe(0)
    expect(JSON.parse(child.stdout)).toEqual({ errors: [] })
  })
})
