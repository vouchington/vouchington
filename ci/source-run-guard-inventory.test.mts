import { describe, expect, it } from 'vitest'

import {
  SOURCE_RUN_EXEMPTIONS,
  SOURCE_RUN_WORKFLOWS,
  listSourceRunSites,
  type WorkflowLike,
} from './source-run-guard-inventory.mts'

const EXPECTED_SITES = [
  { workflow: 'dispatch-completed-deploy.yml', job: 'dispatch' },
  { workflow: 'fix-main.yml', job: 'triage-and-rerun' },
  { workflow: 'fix-main.yml', job: 'related-candidates' },
  { workflow: 'fix-main.yml', job: 'render-prompt' },
  { workflow: 'fix-main.yml', job: 'dispatch' },
  { workflow: 'fix-main.yml', job: 'escalate' },
  { workflow: 'fix-main-self-retry.yml', job: 'retry' },
  { workflow: 'fix-main-self-retry.yml', job: 'escalate-retry-failure' },
  { workflow: 'fix-dependabot.yml', job: 'triage-and-rerun' },
  { workflow: 'fix-dependabot.yml', job: 'render-prompt' },
  { workflow: 'fix-dependabot.yml', job: 'revalidate-dispatch' },
  { workflow: 'fix-dependabot.yml', job: 'dispatch' },
  { workflow: 'fix-dependabot.yml', job: 'escalate' },
]

function siteKey(site: { workflow: string; job: string }): string {
  return `${site.workflow}/${site.job}`
}

describe('listSourceRunSites', () => {
  it('extracts exactly the real workflow_run-derived jobs, no more and no fewer', () => {
    const actual = listSourceRunSites().map(siteKey).sort()
    const expected = EXPECTED_SITES.map(siteKey).sort()
    expect(actual).toEqual(expected)
  })

  it('excludes a job that only reads a needs output derived from the event, not the event itself', () => {
    const sites = listSourceRunSites()
    expect(sites).not.toContainEqual({ workflow: 'fix-dependabot.yml', job: 'check-duplicates' })
  })

  it('treats a reusable-workflow call forwarding a source-run-* input as a site even with no literal event reference', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': {
        jobs: {
          forwarder: {
            uses: './.github/workflows/ci-reusable.yml',
            with: {
              'source-run-id': '${{ needs.upstream.outputs.run-id }}',
            },
          },
        },
      },
    }
    expect(listSourceRunSites(workflows)).toEqual([{ workflow: 'synthetic.yml', job: 'forwarder' }])
  })

  it('excludes a reusable-workflow call whose with block has no source-run-* key', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': {
        jobs: {
          forwarder: {
            uses: './.github/workflows/ci-reusable.yml',
            with: { 'other-input': 'value' },
          },
        },
      },
    }
    expect(listSourceRunSites(workflows)).toEqual([])
  })

  it('treats a job forwarding the workflow_run event through a non-source-run-* with key as a site', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': {
        jobs: {
          forwarder: {
            uses: './.github/workflows/ci-reusable.yml',
            with: { 'run-id': '${{ github.event.workflow_run.id }}' },
          },
        },
      },
    }
    expect(listSourceRunSites(workflows)).toEqual([{ workflow: 'synthetic.yml', job: 'forwarder' }])
  })

  it('excludes a reusable-workflow call with no with block at all', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': { jobs: { forwarder: { uses: './.github/workflows/ci-reusable.yml' } } },
    }
    expect(listSourceRunSites(workflows)).toEqual([])
  })
})

describe('SOURCE_RUN_WORKFLOWS', () => {
  it('covers every workflow file named in a declared exemption', () => {
    for (const exemption of SOURCE_RUN_EXEMPTIONS) {
      expect(SOURCE_RUN_WORKFLOWS).toHaveProperty(exemption.workflow)
    }
  })
})
