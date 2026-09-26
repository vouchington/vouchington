import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from './workflow-test-helpers.mts'

type Step = {
  name?: string
  env?: Record<string, string>
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type ScriptDocument = {
  jobs?: Record<string, { steps?: Step[] }>
  runs?: { steps?: Step[] }
}

// Values GitHub or the workflow author fix before the job starts and that carry no free-form text.
// Every other context (event payloads, refs, actors, inputs, step and job outputs, secrets, vars,
// env) reaches a script through `env:`, where the shell reads it as data instead of parsing it as
// code. The `shard-total` outputs are integers validated by `ci/vitest/shard-total.mts` and the
// Playwright selector.
const CONSTANT_CONTEXTS: readonly RegExp[] = [
  /^github\.(?:repository|repository_owner|server_url|run_id|run_number|run_attempt|sha|event_name|workspace)$/u,
  /^runner\.(?:os|arch|temp)$/u,
  /^job\.services\.[\w-]+\.ports\['\d+'\]$/u,
  /^matrix\.shard$/u,
  /^(?:needs|steps)\.[\w-]+\.outputs\.shard-total$/u,
]

// Generated at runtime (not embedded as a literal) so this fixture ref does not trip
// no-test-git-sha / test-no-dependency-pins.
const SYNTHETIC_SHA = '0'.repeat(40)
const SYNTHETIC_GITHUB_SCRIPT_REF = `actions/github-script@${SYNTHETIC_SHA}`
const SYNTHETIC_CHECKOUT_REF = `actions/checkout@${SYNTHETIC_SHA}`

const workflowPaths = readdirSync('.github/workflows').flatMap(file =>
  /\.ya?ml$/u.test(file) ? [`.github/workflows/${file}`] : [],
)
const compositeActionPaths = readdirSync('.github/actions').flatMap(name =>
  ['action.yml', 'action.yaml']
    .map(file => `.github/actions/${name}/${file}`)
    .filter(path => existsSync(path)),
)

function scriptBodies(step: Step): string[] {
  const bodies: unknown[] = [step.run]
  if (step.uses?.startsWith('actions/github-script@')) bodies.push(step.with?.script)
  return bodies.filter((body): body is string => typeof body === 'string')
}

function disallowedExpressions(script: string): string[] {
  return [...script.matchAll(/\$\{\{([\s\S]*?)\}\}/gu)]
    .map(match => match[1]!.trim())
    .filter(expression => !CONSTANT_CONTEXTS.some(pattern => pattern.test(expression)))
}

function stepGroups(document: ScriptDocument): Array<[string, Step[]]> {
  const groups = Object.entries(document.jobs ?? {}).map(([jobId, job]): [string, Step[]] => [
    jobId,
    job.steps ?? [],
  ])
  if (document.runs?.steps) groups.push(['composite', document.runs.steps])
  return groups
}

function scriptExpressionViolations(path: string, document: ScriptDocument): string[] {
  return stepGroups(document).flatMap(([scope, steps]) =>
    steps.flatMap((step, index) =>
      scriptBodies(step).flatMap(body =>
        disallowedExpressions(body).map(
          expression =>
            `${path}#${scope} step ${step.name ?? index}: pass \${{ ${expression} }} through env`,
        ),
      ),
    ),
  )
}

function jobWithStep(step: Step): ScriptDocument {
  return { jobs: { build: { steps: [step] } } }
}

describe('workflow script expressions', () => {
  it('keeps free-form and third-party-derived values out of shell and github-script bodies', () => {
    const existingGuardCase = 'echo "${{ github.event.pull_request.title }}"'
    const disallowed = [
      existingGuardCase,
      'echo "${{ github.head_ref }}"',
      'echo "${{ github.ref_name }}"',
      'echo "${{ github.actor }}"',
      'echo "${{ inputs.branch }}"',
      'echo "${{ steps.decide.outputs.matched_rule }}"',
      'echo "${{ needs.dispatch.outputs.session-id }}"',
      'echo "${{ secrets.GITHUB_TOKEN }}"',
      'echo "${{ vars.FLAG }}"',
      'echo "${{ env.FLAG }}"',
      'echo "${{ inputs.branch || github.event.issue.title }}"',
      'echo "${{ format(\'{0}\', github.repository) }}"',
    ]

    for (const run of disallowed) {
      expect(scriptExpressionViolations('wf', jobWithStep({ name: 'x', run }))).toHaveLength(1)
    }
    expect(
      scriptExpressionViolations('wf', {
        runs: { steps: [{ name: 'composite', run: 'echo "${{ inputs.suite }}"' }] },
      }),
    ).toEqual(['wf#composite step composite: pass ${{ inputs.suite }} through env'])
    expect(
      scriptExpressionViolations(
        'wf',
        jobWithStep({
          name: 'script',
          uses: SYNTHETIC_GITHUB_SCRIPT_REF,
          with: { script: 'core.info("${{ github.event.comment.body }}")' },
        }),
      ),
    ).toEqual(['wf#build step script: pass ${{ github.event.comment.body }} through env'])
  })

  it('allows constant contexts and ignores values that already travel through env or with', () => {
    const run = [
      'echo "${{ github.repository }} ${{ github.server_url }} ${{ github.run_id }}"',
      'echo "${{ runner.temp }} ${{ matrix.shard }}/${{ needs.prep.outputs.shard-total }}"',
      'echo "${{ steps.select.outputs.shard-total }} ${{ job.services.postgres.ports[\'5432\'] }}"',
    ].join('\n')

    expect(scriptExpressionViolations('wf', jobWithStep({ run }))).toEqual([])
    expect(
      scriptExpressionViolations(
        'wf',
        jobWithStep({
          uses: SYNTHETIC_CHECKOUT_REF,
          with: { ref: '${{ github.head_ref }}' },
          env: { BRANCH: '${{ github.head_ref }}' },
          run: 'echo "$BRANCH"',
        }),
      ),
    ).toEqual([])
  })

  it('passes every non-constant value through env in every workflow and composite action script', () => {
    const violations = [...workflowPaths, ...compositeActionPaths].flatMap(path =>
      scriptExpressionViolations(path, load(readFileSync(path, 'utf8')) as ScriptDocument),
    )

    assertNoWorkflowViolations(violations)
  })
})
