import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const ROOT_URL = new URL('../', import.meta.url)
const readRepoFile = (path: string): string => readFileSync(new URL(path, ROOT_URL), 'utf8')
const normalized = (path: string): string => readRepoFile(path).replace(/\s+/g, ' ')

const MONOLITHIC_TRIAGE_SKILLS = ['triage-prs', 'triage-security'] as const

describe('agent-authored PR creation feedback contract', () => {
  it('defines one canonical evidence and recommendation rubric', () => {
    const review = normalized('.agents/skills/agent-workflow/code-review.md')

    expect(review).toContain('Agent-Authored PR Creation Feedback')
    expect(review).toContain('[pr-description](../pr-description/SKILL.md)')
  })

  it.each(MONOLITHIC_TRIAGE_SKILLS)(
    'wires %s directly to the canonical rubric and retrospective flow',
    skill => {
      const contents = normalized(`.agents/skills/${skill}/SKILL.md`)

      expect(contents).toContain(
        '[agent-authored PR creation feedback](../agent-workflow/code-review.md#agent-authored-pr-creation-feedback)',
      )
      expect(contents).toContain('[retrospective](../retrospective/SKILL.md)')
    },
  )

  it('refreshes queue feedback after triage actions without waiting on the async shepherd', () => {
    const triage = normalized('.agents/skills/triage-prs/SKILL.md')
    const initialAssessment = triage.indexOf('PR creation feedback:')
    // 'Step 6a' is the recurring section-label identifier for the action-time-refresh step; scoped
    // past initialAssessment so it can't match an earlier unrelated mention.
    const actionTimeRefresh = triage.indexOf('Step 6a', initialAssessment)
    const retrospective = triage.indexOf('[retrospective]')

    expect(initialAssessment).toBeGreaterThan(-1)
    expect(actionTimeRefresh).toBeGreaterThan(initialAssessment)
    expect(retrospective).toBeGreaterThan(actionTimeRefresh)
  })

  it('authorizes one provenance-checked draft feedback PR before the retrospective', () => {
    const triage = normalized('.agents/skills/triage-prs/SKILL.md')
    const actionTimeRefresh = triage.indexOf('Step 6a')
    const feedbackPublication = triage.indexOf('pr-creation-feedback-origin: triage-prs')
    const duplicateResolution = triage.indexOf('Duplicate resolution')
    const disposition = triage.indexOf('Retrospective disposition')
    const retrospective = triage.indexOf('[retrospective]')

    expect(triage).toContain('docs/prompts/**')
    expect(feedbackPublication).toBeGreaterThan(actionTimeRefresh)
    expect(duplicateResolution).toBeGreaterThan(feedbackPublication)
    expect(disposition).toBeGreaterThan(duplicateResolution)
    expect(retrospective).toBeGreaterThan(disposition)
    expect(triage).toContain('origin/main')
    expect(triage).toContain('`Plan:`')
    expect(triage).toContain('`automation`')
  })

  it('suppresses feedback creation when the durable origin marker is present', () => {
    const triage = normalized('.agents/skills/triage-prs/SKILL.md')
    const marker = triage.indexOf('pr-creation-feedback-origin: triage-prs')
    const duplicateResolution = triage.indexOf('Duplicate resolution')
    const markerRule = triage.slice(marker, duplicateResolution)

    expect(marker).toBeGreaterThan(-1)
    expect(markerRule).toContain('`none`')
  })

  it('has deterministic duplicate and retrospective-disposition branches', () => {
    const triage = normalized('.agents/skills/triage-prs/SKILL.md')

    for (const token of [
      'duplicate: zero-overlap',
      'duplicate: exact-match',
      'duplicate: ambiguous',
      'disposition: published',
      'disposition: deferred',
      'disposition: user-choice',
      'preauthorized-pr #N',
      '`deferred`',
    ])
      expect(triage).toContain(token)
  })

  it('delegates retrospective feedback structure to the canonical workflow and retains local persistence', () => {
    const retrospective = normalized('.agents/skills/retrospective/SKILL.md')

    expect(retrospective).toContain('vouchington-workflow:retrospective')
    expect(retrospective).toContain('node dev/retrospective-save.mts')
    expect(retrospective).toContain('[PR feedback](pr-feedback.md)')
  })

  it('records a preauthorized feedback PR disposition without another user prompt', () => {
    const feedback = normalized('.agents/skills/retrospective/pr-feedback.md')

    expect(feedback).toContain('preauthorized-pr')
    expect(feedback).toContain('Disposition: preauthorized-pr #N')
  })

  it('delegates feedback classification to the canonical workflow and retains local issue routing', () => {
    const distill = normalized('.agents/skills/retrospective-distill/SKILL.md')
    const snapshotExportIndex = distill.indexOf('snapshot_export')
    const delegationIndex = distill.indexOf('manifest.schemaVersion === 1')

    expect(distill).toContain('vouchington-workflow:retrospective-distill')
    expect(distill).toContain('[github-issue](../github-issue/SKILL.md)')
    expect(snapshotExportIndex).toBeLessThan(delegationIndex)
    expect(distill).not.toMatch(/nextCursor/i)
    expect(distill).toContain('manifest.schemaVersion === 1')
    expect(distill).toContain('--retro-days')
    expect(distill).toContain('--session-days')
    expect(distill).toContain('selection.inactiveForHours')
    expect(distill).toContain('entry-type-unresolved')
    expect(distill).toContain('lastEntryAt')
    expect(distill).toContain('[distilling.md](distilling.md)')
  })

  it('keeps retrospective mechanics local without weakening the canonical evidence boundary', () => {
    const retrospective = normalized('.agents/skills/retrospective/SKILL.md')
    const localGuidance = [
      retrospective,
      normalized('.agents/skills/retrospective/fact-contracts.md'),
      normalized('.agents/skills/retrospective/saving.md'),
    ].join(' ')

    expect(retrospective).toContain('vouchington-workflow:retrospective')
    expect(retrospective).toContain('≤10 tool calls, ≤5 minutes, ≤25k tokens')
    expect(retrospective).toContain('`grep`, `rg`, `jq`, or `awk`')
    expect(localGuidance).not.toContain('retrospective-facts --raw')
    expect(localGuidance).not.toMatch(
      /(?:save|persist|store|retain|record|embed|include)\s+(?:any\s+|all\s+|the\s+)?(?:raw|unredacted)\b/i,
    )
  })

  it('documents the feedback loop and leaves shepherd handoff mechanical', () => {
    const prompts = normalized('docs/prompts/README.md')
    const labels = normalized(
      'docs/development/reference-merge-authority-automation-pr-labeling.md',
    )
    const shepherd = normalized('.agents/skills/ready-and-shepherd/SKILL.md')

    expect(prompts).toContain('```mermaid')
    expect(prompts).toContain('docs/prompts/**')
    expect(prompts).toContain('preauthorized-pr')
    expect(labels).toContain('pr-creation-feedback-origin: triage-prs')
    expect(labels).toContain('automation')
    expect(shepherd).not.toContain('PR Creation Feedback')
    expect(shepherd).not.toContain('agent-authored PR creation feedback')
  })
})
