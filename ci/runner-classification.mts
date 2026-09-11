/**
 * Classifies a job's `runs-on` value into the runner taxonomy documented in
 * .github/workflows/reference-runner-types.md -- by matching the label text itself, never by
 * parsing workflow YAML. Consumed by render-workflow-runner-inventory.mts's Category/Exception
 * Rationale columns.
 */
import type { WorkflowJobNode } from 'no-mistakes'

export type RunnerClassification = { category: string; rationale: string }

// Cell value for Category/Exception Rationale when the concept doesn't apply to a row: a
// reusable-workflow delegate (no runner of its own), or a self-hosted/runner-group job that needs
// no exception from the self-hosted-first default policy.
const NOT_APPLICABLE = '—'

const CATEGORY_SELF_HOSTED = 'Self-hosted'
const CATEGORY_UBICLOUD = 'Ubicloud (ephemeral)'
const CATEGORY_UBICLOUD_CODEBUILD_ESCAPE = 'Ubicloud (ephemeral) / CodeBuild escape hatch'
const CATEGORY_RUNNER_GROUP = 'Runner group'
const CATEGORY_VARIES = 'Varies (parameterized)'

// The closed set of jobs pinned to `ubicloud-standard-2` for reasons other than ARM64, keyed by
// job id (`${workflowId}#${key}`) and sourced from reference-runner-types.md's ubicloud-standard-2
// paragraph. Stays in lockstep with the closed set enforced by
// .github/workflows/ephemeral-runner-policy.test.mts: a job added there without an entry here
// makes classifyRunsOnString() throw below.
const UBICLOUD_STANDARD_2_RATIONALE: Record<string, string> = {
  '.github/workflows/pnpm-dedupe.yml#dedupe':
    'Creates commits; ephemeral avoids writing git identity into a persistent self-hosted workspace.',
}

// The two ARM-tier Ubicloud pools, keyed by the exact `runs-on` label -- also sourced from
// reference-runner-types.md.
const UBICLOUD_ARM_RATIONALE: Record<string, string> = {
  'ubicloud-standard-4-arm': 'Default runner for build-web.yml build in every context.',
  'ubicloud-standard-8-arm': 'Default runner for build-backend.yml build in every context.',
}

const CODEBUILD_ESCAPE_HATCH_RATIONALE =
  'Opt-in CodeBuild escape hatch (CI_IMAGE_BUILDS_ON_CODEBUILD var or codebuild:images label) ' +
  'reaches AWS over the backbone instead of Ubicloud (issue #6681); falls back to Ubicloud by default.'

/**
 * Classifies a string-shaped `runs-on` value. Order matters: the CodeBuild/Ubicloud conditional
 * expression used by build-web.yml/build-backend.yml is wrapped in a `${{ ... }}` ternary and
 * embeds both a `codebuild-` label and a static `ubicloud-standard-{4,8}-arm` fallback in one
 * string.
 */
function classifyRunsOnString(runsOnValue: string, jobId: string): RunnerClassification {
  if (runsOnValue.startsWith('${{')) {
    if (runsOnValue.includes('codebuild-')) {
      const armMatch = /ubicloud-standard-(4|8)-arm/.exec(runsOnValue)
      if (armMatch === null) {
        throw new Error(`${jobId} mixes a codebuild- runner with an unrecognized Ubicloud fallback`)
      }
      const armRationale = UBICLOUD_ARM_RATIONALE[`ubicloud-standard-${armMatch[1]}-arm`]
      return {
        category: CATEGORY_UBICLOUD_CODEBUILD_ESCAPE,
        rationale: `${armRationale} ${CODEBUILD_ESCAPE_HATCH_RATIONALE}`,
      }
    }
    // A `${{ ... }}` expression (matrix variable, reusable-workflow input) whose actual runner
    // can't be resolved without parsing YAML/matrix definitions -- forbidden here. Report it as
    // varying rather than guessing from the expression text.
    return { category: CATEGORY_VARIES, rationale: NOT_APPLICABLE }
  }
  if (runsOnValue in UBICLOUD_ARM_RATIONALE) {
    return { category: CATEGORY_UBICLOUD, rationale: UBICLOUD_ARM_RATIONALE[runsOnValue] }
  }
  if (runsOnValue === 'ubicloud-standard-2') {
    const rationale = UBICLOUD_STANDARD_2_RATIONALE[jobId]
    if (rationale === undefined) {
      throw new Error(
        `${jobId} runs on ubicloud-standard-2 but has no documented exception rationale -- ` +
          'update UBICLOUD_STANDARD_2_RATIONALE and reference-runner-types.md together',
      )
    }
    return { category: CATEGORY_UBICLOUD, rationale }
  }
  throw new Error(
    `${jobId} has an unrecognized runs-on value ${JSON.stringify(runsOnValue)} -- ` +
      'classify it in classifyRunsOnString()',
  )
}

/**
 * Classifies a job's `runs-on` into a runner category and, if it's an exception to the
 * self-hosted-first default policy, the documented rationale for that exception.
 */
export function classifyRunner(job: WorkflowJobNode): RunnerClassification {
  if (job.runsOn === undefined) return { category: NOT_APPLICABLE, rationale: NOT_APPLICABLE }
  if (Array.isArray(job.runsOn)) {
    if (job.runsOn[0] === 'self-hosted') {
      return { category: CATEGORY_SELF_HOSTED, rationale: NOT_APPLICABLE }
    }
    throw new Error(`${job.id} has an unrecognized array runs-on ${JSON.stringify(job.runsOn)}`)
  }
  if (typeof job.runsOn === 'string') return classifyRunsOnString(job.runsOn, job.id)
  return { category: CATEGORY_RUNNER_GROUP, rationale: NOT_APPLICABLE }
}
