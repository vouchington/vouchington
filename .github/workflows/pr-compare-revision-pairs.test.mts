import { describe, expect, it } from 'vitest'

import type { OpsWorkflow, OpsWorkflowStep } from '../../ci/workflow-ops-policy.mts'
import { prRevisionPairViolations } from '../../ci/workflow-revision-policy.mts'

const PR_BASE_SHA = '${{ github.event.pull_request.base.sha }}'
const MERGE_SHA = '${{ github.sha }}'

type PathsFilterStep = OpsWorkflowStep & { with?: Record<string, string> }

const mergeQueueWorkflowFixture = {
  jobs: {
    'detect-changes': {
      steps: [
        {
          name: 'Resolve merge queue diff range',
          if: "github.event_name == 'merge_group'",
          run: 'HEAD_SHA="$(git rev-parse HEAD)"\nBASE_SHA="$(git merge-base origin/main "$HEAD_SHA")"',
        },
        {
          name: 'Check for docs-only changes',
          env: {
            EVENT_NAME: '${{ github.event_name }}',
            MERGE_QUEUE_BASE_SHA: '${{ steps.merge-queue-range.outputs.base }}',
            MERGE_QUEUE_HEAD_SHA: '${{ steps.merge-queue-range.outputs.head }}',
          },
          run: 'git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA"',
        },
        {
          uses: 'dorny/paths-filter@synthetic',
          with: {
            base: '${{ steps.merge-queue-range.outputs.base }}',
            ref: '${{ steps.merge-queue-range.outputs.head }}',
          },
        },
        {
          uses: 'dorny/paths-filter@synthetic',
          with: {
            base: '${{ steps.merge-queue-range.outputs.base }}',
            ref: '${{ steps.merge-queue-range.outputs.head }}',
          },
        },
      ],
    },
  },
} satisfies OpsWorkflow

describe('PR compare revision pairs', () => {
  it('never diffs pull_request.base.sha against github.sha', () => {
    const workflows = {
      '.github/workflows/ci-detect-changes.yml': mergeQueueWorkflowFixture,
      '.github/workflows/compare.yml': {
        jobs: {
          compare: {
            steps: [
              {
                env: { BASE_SHA: PR_BASE_SHA, MERGE_SHA },
                run: 'git diff "$BASE_SHA" "$MERGE_SHA"',
              },
            ],
          },
        },
      },
    } satisfies Record<string, OpsWorkflow>
    const sources = {
      '.github/workflows/ci-detect-changes.yml': 'fixture workflow',
      '.github/workflows/compare.yml': 'fixture workflow',
    }

    expect(prRevisionPairViolations(workflows, sources)).toEqual([
      '.github/workflows/compare.yml#compare step 0: git compare mixes pull_request.base.sha with github.sha (git diff "$BASE_SHA" "$MERGE_SHA")',
    ])
    expect(
      prRevisionPairViolations(
        { '.github/workflows/ci-detect-changes.yml': mergeQueueWorkflowFixture },
        { '.github/workflows/ci-detect-changes.yml': 'fixture workflow' },
      ),
    ).toEqual([])
  })

  it('inspects revision comparisons inside an extracted workflow script', () => {
    const workflows = {
      '.github/workflows/ci-detect-changes.yml': mergeQueueWorkflowFixture,
      '.github/workflows/compare.yml': {
        jobs: {
          compare: {
            steps: [
              {
                env: { BASE_SHA: PR_BASE_SHA, MERGE_SHA },
                run: 'source .github/workflows/ci-detect-changes/trusted-context.sh',
              },
            ],
          },
        },
      },
    } satisfies Record<string, OpsWorkflow>
    const sources = {
      '.github/workflows/ci-detect-changes.yml': 'fixture workflow',
      '.github/workflows/ci-detect-changes/trusted-context.sh': 'echo "$BASE_SHA" "$MERGE_SHA"',
    }
    expect(prRevisionPairViolations(workflows, sources)).toEqual([])
    expect(
      prRevisionPairViolations(workflows, {
        ...sources,
        '.github/workflows/ci-detect-changes/trusted-context.sh':
          'git diff "$BASE_SHA" "$MERGE_SHA"',
      }),
    ).toEqual([
      '.github/workflows/compare.yml#compare step 0: git compare mixes pull_request.base.sha with github.sha (git diff "$BASE_SHA" "$MERGE_SHA")',
    ])
  })

  it('pins one merge-queue range and reuses it for docs and both path filters', () => {
    const workflow = mergeQueueWorkflowFixture
    const steps = workflow.jobs?.['detect-changes']?.steps ?? []
    const range = steps.find(candidate => candidate.name === 'Resolve merge queue diff range')!
    const step = steps.find(candidate => candidate.name === 'Check for docs-only changes')!
    expect(step.env).toEqual({
      EVENT_NAME: '${{ github.event_name }}',
      MERGE_QUEUE_BASE_SHA: '${{ steps.merge-queue-range.outputs.base }}',
      MERGE_QUEUE_HEAD_SHA: '${{ steps.merge-queue-range.outputs.head }}',
    })
    expect(range.if).toBe("github.event_name == 'merge_group'")
    expect(range.run).toContain('git rev-parse HEAD')
    expect(range.run).toContain('git merge-base origin/main "$HEAD_SHA"')
    expect(step.run).toContain(
      'git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA"',
    )
    // Both inputs are empty outside merge groups, so on pull requests paths-filter reads the PR API
    // file list: the layer's own files.
    const filters = (steps as PathsFilterStep[]).filter(candidate =>
      candidate.uses?.startsWith('dorny/paths-filter@'),
    )
    expect(filters).toHaveLength(2)
    for (const filter of filters) {
      expect(filter.with).toMatchObject({
        base: '${{ steps.merge-queue-range.outputs.base }}',
        ref: '${{ steps.merge-queue-range.outputs.head }}',
      })
    }
  })
})
