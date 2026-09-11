import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { validateRetroDoc } from '../retrospective-validate.mts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

// Byte-identical to the step-0 UAT baseline fixtures (already run through the
// real, extracted has_valid_ci_failure_section awk — exit 0) so this test
// proves the TypeScript port agrees with the original on a known-good doc,
// not just on cases invented alongside the port.
const VALID_RETRO = `---
date: 2026-07-20
description: Baseline schema sample for agent-blackboard UAT equivalence check (not a real completed session retro)
issues: []
prs: []
session_id: f5413927-eec3-4204-90c6-4f81b6a413e4
worktree: bubbly-knitting-manatee
---

# Retrospective: PR #s - agent-blackboard UAT baseline schema sample

## Verifiable Facts

=== Retrospective Facts ===
(placeholder — real run records canonically minimized retrospective facts here)

## Transcript Facts

=== Transcript Facts ===
(placeholder — real run records canonically minimized transcript facts here)

## CI Failures

Status: failures observed

- \`one-off\` — \`GitHub Actions\` — sample-workflow / sample-job
  - Evidence: https://github.com/example/example/actions/runs/123456789
  - Root diagnostic: sample assertion failure in sample-test.mts
  - Disposition: fixed by commit 0000000000000000000000000000000000000

## Free-form reflection

Sample body for baseline schema validation only.

## Skill Evaluation

Sample body for baseline schema validation only.
`

// Same doc, but Status: none observed with a failure group still present —
// the real awk (also run against this exact fixture) rejects it: exit 1.
const INVALID_STATUS_GROUP_MISMATCH_RETRO = VALID_RETRO.replace(
  'Status: failures observed',
  'Status: none observed',
)

const INVALID_LOCAL_CHECK_RETRO = VALID_RETRO.replace('`GitHub Actions`', '`local check`')
const VALID_BACKTICKED_GITHUB_ACTIONS_DETAIL_RETRO = VALID_RETRO.replace(
  'sample-workflow / sample-job',
  'build `lint` — failed',
)

describe('validateRetroDoc', () => {
  it('accepts the proven-valid baseline fixture (matches the real awk: exit 0)', () => {
    expect(validateRetroDoc(VALID_RETRO)).toEqual({ ok: true, errors: [] })
  })

  it('rejects the proven-invalid baseline fixture (matches the real awk: exit 1)', () => {
    const result = validateRetroDoc(INVALID_STATUS_GROUP_MISMATCH_RETRO)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'failure-group entries are present but Status is not "failures observed"',
    )
  })

  it('rejects an unsupported backticked local check source with a specific diagnostic', () => {
    expect(validateRetroDoc(INVALID_LOCAL_CHECK_RETRO)).toEqual({
      ok: false,
      errors: ['failure-group source must be `GitHub Actions`'],
    })
  })

  it('accepts a GitHub Actions group whose description contains backticks', () => {
    expect(validateRetroDoc(VALID_BACKTICKED_GITHUB_ACTIONS_DETAIL_RETRO)).toEqual({
      ok: true,
      errors: [],
    })
  })

  it('accepts a minimal doc with Status: none observed and no failure groups', () => {
    const doc = `## Verifiable Facts

=== Retrospective Facts ===

## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: none observed
`
    expect(validateRetroDoc(doc)).toEqual({ ok: true, errors: [] })
  })

  it('accepts a minimal doc with a non-blank Status: unavailable reason', () => {
    const doc = `## Verifiable Facts

=== Retrospective Facts ===

## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: unavailable (no CI configured for this repository)
`
    expect(validateRetroDoc(doc)).toEqual({ ok: true, errors: [] })
  })

  it('rejects a blank Status: unavailable reason', () => {
    const doc = `## Verifiable Facts

=== Retrospective Facts ===

## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: unavailable ()
`
    const result = validateRetroDoc(doc)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'Status line must be "Status: failures observed", "Status: none observed", or "Status: unavailable (<non-blank reason>)"',
    )
  })

  it('reports each missing header/marker independently', () => {
    const result = validateRetroDoc('# empty doc\n')
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'missing "## Verifiable Facts" section header',
        'missing "=== Retrospective Facts ===" marker',
        'missing "## Transcript Facts" section header',
        'missing "=== Transcript Facts ===" marker',
        'missing "## CI Failures" section header',
      ]),
    )
  })

  it('rejects CI Failures appearing before Transcript Facts', () => {
    const doc = `## CI Failures

Status: none observed

## Transcript Facts

=== Transcript Facts ===
`
    const result = validateRetroDoc(doc)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      '"## CI Failures" must appear exactly once, immediately after "## Transcript Facts"',
    )
  })

  it('rejects another section interposed between Transcript Facts and the CI section', () => {
    const doc = `## Transcript Facts

=== Transcript Facts ===

## Something Else

## CI Failures

Status: none observed
`
    const result = validateRetroDoc(doc)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      '"## CI Failures" must appear exactly once, immediately after "## Transcript Facts"',
    )
  })

  it('rejects zero Status lines in the CI section', () => {
    const doc = `## Transcript Facts

=== Transcript Facts ===

## CI Failures

no status line here
`
    const result = validateRetroDoc(doc)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      '"## CI Failures" must contain exactly one "Status: " line (found 0)',
    )
  })

  it('rejects two Status lines in the CI section', () => {
    const doc = `## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: none observed
Status: none observed
`
    const result = validateRetroDoc(doc)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      '"## CI Failures" must contain exactly one "Status: " line (found 2)',
    )
  })

  it('rejects an incomplete failure-group entry', () => {
    const doc = `## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: failures observed

- \`one-off\` — \`GitHub Actions\` — sample-job
  - Evidence: https://example.com
`
    const result = validateRetroDoc(doc)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'a failure-group entry is missing its Evidence, Root diagnostic, or Disposition line',
    )
  })

  it('rejects unexpected content inside the CI section', () => {
    const doc = `## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: none observed
some stray unexpected line
`
    const result = validateRetroDoc(doc)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('unexpected content inside "## CI Failures"')
  })

  it('rejects Status: failures observed with zero failure groups', () => {
    const doc = `## Transcript Facts

=== Transcript Facts ===

## CI Failures

Status: failures observed
`
    const result = validateRetroDoc(doc)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      '"Status: failures observed" requires at least one failure-group entry',
    )
  })

  it('keeps retrospective templates on the same CI Failures header as the validator', () => {
    const skill = readFileSync(`${repoRoot}/.agents/skills/retrospective/SKILL.md`, 'utf8')
    const saving = readFileSync(`${repoRoot}/.agents/skills/retrospective/saving.md`, 'utf8')
    for (const source of [skill, saving]) {
      expect(source).toContain('## CI Failures')
      expect(source).not.toContain('## CI and Pre-Push Failures')
    }
  })
})
