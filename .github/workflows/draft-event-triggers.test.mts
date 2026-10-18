// Interim: remove once jonathanong/no-mistakes#2182 ships the generic rule.
import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from '../test-helpers/workflow-fixtures.mts'

// No job reads draft state, so a draft transition must not start a run.
const DRAFT_ACTIVITY_TYPES = ['ready_for_review', 'converted_to_draft']

function draftTriggerViolations(path: string, document: { on?: unknown }): string[] {
  const trigger = document.on
  if (trigger === null || typeof trigger !== 'object' || Array.isArray(trigger)) return []
  return Object.entries(trigger).flatMap(([event, config]) => {
    const types = (config as { types?: unknown } | null)?.types
    if (!Array.isArray(types)) return []
    return types
      .filter((type): type is string => DRAFT_ACTIVITY_TYPES.includes(type as string))
      .map(type => `${path}: ${event} subscribes to ${type}`)
  })
}

describe('draft transition triggers', () => {
  it('flags draft activity types on any event and ignores other types', () => {
    expect(
      draftTriggerViolations('wf', {
        on: {
          pull_request: { types: ['opened', 'ready_for_review'] },
          pull_request_target: { types: ['converted_to_draft'] },
          push: null,
        },
      }),
    ).toEqual([
      'wf: pull_request subscribes to ready_for_review',
      'wf: pull_request_target subscribes to converted_to_draft',
    ])
    expect(
      draftTriggerViolations('wf', { on: { pull_request: { types: ['opened', 'synchronize'] } } }),
    ).toEqual([])
    expect(draftTriggerViolations('wf', { on: 'push' })).toEqual([])
  })

  it('keeps every workflow off ready_for_review and converted_to_draft', () => {
    const violations = readdirSync('.github/workflows')
      .filter(file => /\.ya?ml$/u.test(file))
      .flatMap(file => {
        const path = `.github/workflows/${file}`
        return draftTriggerViolations(path, load(readFileSync(path, 'utf8')) as { on?: unknown })
      })

    assertNoWorkflowViolations(violations)
  })
})
