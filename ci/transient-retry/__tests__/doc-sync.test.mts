import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { RULES } from '../rules.mts'

// Guard: every transient-retry rule id mentioned in the canonical transient-retry reference must exist
// in the RULES catalogue. This catches renamed or deleted rules whose doc entry wasn't updated.
//
// The compact ci.md index only routes readers to the dedicated reference. Keeping the rule-id scan
// on that leaf avoids accidentally collecting unrelated static-analysis rule identifiers.
function extractTransientRetryRuleIds(referenceContent: string): string[] {
  return Array.from(referenceContent.matchAll(/`([a-z0-9-]+)` rule/g), m => m[1])
}

describe('transient-retry rule docs sync', () => {
  const ruleIds = new Set(RULES.map(r => r.id))

  it('ci.md routes transient-retry guidance to the canonical reference', () => {
    const ciMd = readFileSync('docs/development/ci.md', 'utf8')
    const transientReference = readFileSync(
      'docs/development/reference-ci-classifying-transient-infrastructure-failures.md',
      'utf8',
    )
    const mentionedIds = extractTransientRetryRuleIds(transientReference)

    expect(ciMd).toContain(
      '[Classifying Transient Infrastructure Failures](reference-ci-classifying-transient-infrastructure-failures.md)',
    )
    expect(mentionedIds.length).toBeGreaterThan(0)
  })

  it('every rule id named in the transient-retry reference exists in the RULES catalogue', () => {
    const transientReference = readFileSync(
      'docs/development/reference-ci-classifying-transient-infrastructure-failures.md',
      'utf8',
    )
    const mentionedIds = extractTransientRetryRuleIds(transientReference)
    const staleIds = mentionedIds.filter(id => !ruleIds.has(id))
    // Failing here means a rule id was renamed/deleted without updating the canonical reference.
    expect(staleIds).toEqual([])
  })

  it('documents current coverage transport and optional-artifact fingerprints', () => {
    const transientReference = readFileSync(
      'docs/development/reference-ci-classifying-transient-infrastructure-failures.md',
      'utf8',
    )

    expect(transientReference).toContain('`coverage-transport-exhausted`')
    expect(transientReference).toContain('Require a persisted <suite> coverage pair')
    expect(transientReference).toContain(
      'Optional same-run artifact unavailable; continuing with validated fallback',
    )
    expect(transientReference).toContain(
      '[optional-run-artifacts] selected artifact=coverage-<suite>',
    )
    expect(transientReference).not.toContain('fallback-only control marker')
    expect(transientReference).not.toContain('coverage-lcov-upload-artifact-timeout')
    expect(transientReference).not.toContain('PRESIGN_MANIFEST: {}')
  })

  it('documents the live fix-main dispatch output name', () => {
    const rerunReference = readFileSync(
      'ci/transient-retry/reference-how-automatic-reruns-work-on-main-ci-only.md',
      'utf8',
    )

    expect(rerunReference).toContain('outputs.should_dispatch')
    expect(rerunReference).toContain('should_dispatch=false')
    expect(rerunReference).not.toContain('should_codex')
  })

  it('documents automatic main recovery as default-off behind the Harness gate', () => {
    const paths = [
      'ci/transient-retry/README.md',
      'ci/transient-retry/reference-what-is-the-rule-catalogue.md',
      'ci/transient-retry/reference-how-automatic-reruns-work-on-main-ci-only.md',
      'docs/development/reference-ci-classifying-transient-infrastructure-failures.md',
    ]
    const documents = paths.map(path => readFileSync(path, 'utf8'))

    for (const document of documents) {
      expect(document).toContain('HARNESS_DISPATCH_ENABLED')
      expect(document).toContain('HARNESS_FIX_MAIN_ENABLED')
      expect(document).toMatch(/unset|default-off/u)
    }
    expect(documents[2]).toContain('Procedure when enabled')
  })

  describe('extractTransientRetryRuleIds', () => {
    it('returns an empty array when no rule ids are present', () => {
      expect(extractTransientRetryRuleIds('no transient rule ids here')).toEqual([])
    })

    it('extracts rule ids from the transient-retry reference', () => {
      const fixture = [
        '| Action |',
        '| ------ |',
        '| Rerun by the `my-rule-a` rule |',
        '| Rerun by the `my-rule-b` rule |',
      ].join('\n')

      expect(extractTransientRetryRuleIds(fixture)).toEqual(['my-rule-a', 'my-rule-b'])
    })

    it('extracts rule ids through the end of the reference', () => {
      const fixture = ['| Action |', '| ------ |', '| Rerun by the `trailing-rule` rule |'].join(
        '\n',
      )

      expect(extractTransientRetryRuleIds(fixture)).toEqual(['trailing-rule'])
    })

    it('flags a non-existent rule id as stale', () => {
      const fixture = [
        '| Action |',
        '| ------ |',
        '| Rerun by the `non-existent-rule-id` rule |',
      ].join('\n')

      const mentionedIds = extractTransientRetryRuleIds(fixture)
      const staleIds = mentionedIds.filter(id => !ruleIds.has(id))
      expect(staleIds).toEqual(['non-existent-rule-id'])
    })
  })
})
