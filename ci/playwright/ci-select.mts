import { appendFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { isRunnablePlaywrightSpec, planTests } from '../test-plan.mts'
import { writeSelectedFilesOutput } from 'vouchington-tooling/gha-selected-files'
import {
  playwrightSelectionOutputs,
  runnablePlaywrightSpecCount,
  type PlaywrightSelectionOutputs,
} from './shard-selection.mts'

function writeOutput(key: string, value: string): void {
  const f = process.env['GITHUB_OUTPUT']
  if (f) appendFileSync(f, `${key}=${value}\n`)
  console.log(`[select] ${key}=${value}`)
}

function appendSummary(text: string): void {
  const f = process.env['GITHUB_STEP_SUMMARY']
  if (f) appendFileSync(f, text)
}

export const PLAN_JSON_ARTIFACT = 'playwright-test-plan.json'
export const PLAN_MARKDOWN_ARTIFACT = 'playwright-test-plan.md'

export function groupCount(
  planGroups: { type: string; selected: string[] }[],
  type: string,
): number {
  return (planGroups.find(group => group.type === type)?.selected ?? []).filter(
    isRunnablePlaywrightSpec,
  ).length
}

export function playwrightPlanOptions(
  worktreeRoot: string,
  baseBranch: string,
): Parameters<typeof planTests>[0] {
  return {
    framework: 'playwright',
    worktreeRoot,
    environment: 'pullRequest',
    base: `origin/${baseBranch}`,
    head: 'HEAD',
    timeout: 0,
    lockTimeout: 0,
  }
}

function writePlanArtifacts(plan: Awaited<ReturnType<typeof planTests>>): void {
  writeFileSync(PLAN_JSON_ARTIFACT, `${JSON.stringify(plan.json, null, 2)}\n`)
  writeFileSync(
    PLAN_MARKDOWN_ARTIFACT,
    plan.comment ? `${plan.comment}\n` : 'No planner explanation was generated.\n',
  )
}

function planCommentSummary(comment: string): string {
  if (!comment) return ''
  return [
    '',
    '<details><summary>Planner explanation</summary>',
    '',
    comment,
    '</details>',
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const eventName = process.env['EVENT_NAME'] ?? ''
  const worktreeRoot = process.env['GITHUB_WORKSPACE'] ?? process.cwd()
  const shardTotalOverride = process.env['SHARD_TOTAL_OVERRIDE']

  const writeSelection = (selection: PlaywrightSelectionOutputs): void => {
    writeOutput('skip', selection.skip)
    writeOutput('full-suite', selection.fullSuite)
    writeSelectedFilesOutput('files', selection.files)
    writeOutput('shard-total', selection.shardTotal)
    writeOutput('reason', selection.reason)
  }

  const fullOut = (reason: string, note: string): void => {
    writeSelection(
      playwrightSelectionOutputs({
        mode: 'full',
        fullSuiteSpecCount: runnablePlaywrightSpecCount(worktreeRoot),
        reason,
        shardTotalOverride,
      }),
    )
    appendSummary(`## Playwright Test Selection\n\n**Mode:** Full suite - ${note}\n`)
    try {
      writeFileSync(
        PLAN_JSON_ARTIFACT,
        `${JSON.stringify({ mode: 'full', reason, note, plannerExecuted: false }, null, 2)}\n`,
      )
      writeFileSync(
        PLAN_MARKDOWN_ARTIFACT,
        `# Playwright test plan\n\nFull suite: ${note}\n\nReason: ${reason}\n`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[select] failed to write fallback test plan artifacts: ${message}`)
    }
  }

  if (eventName !== 'pull_request') {
    fullOut(`non-PR event (${eventName || 'unknown'})`, `event is \`${eventName || 'unknown'}\``)
    return
  }

  // Use GITHUB_BASE_REF when available so PRs targeting release/feature branches work correctly.
  const baseBranch = process.env['GITHUB_BASE_REF'] || 'main'

  let labels: string[] = []
  try {
    labels = JSON.parse(process.env['PR_LABELS'] ?? '[]') as string[]
  } catch {
    /* ignore malformed labels */
  }
  if (labels.includes('playwright:full')) {
    fullOut('playwright:full label', '`playwright:full` label is set')
    return
  }

  let plan: Awaited<ReturnType<typeof planTests>>
  try {
    plan = await planTests(playwrightPlanOptions(worktreeRoot, baseBranch))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fullOut('test planner failed', `no-mistakes test planner failed - ${message}`)
    return
  }

  try {
    writePlanArtifacts(plan)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[select] failed to write test plan artifacts: ${message}`)
  }

  if (plan.fallbackTriggered) {
    const reason = plan.fallbackReason ?? 'test plan requested full suite'
    fullOut(reason, reason)
    appendSummary(planCommentSummary(plan.comment))
    return
  }

  const selected = plan.files
  const direct = groupCount(plan.groups, 'direct')
  const coverage = groupCount(plan.groups, 'coverage')
  const dependencies = groupCount(plan.groups, 'dependencies')
  const sample = groupCount(plan.groups, 'sample')
  const selection = playwrightSelectionOutputs({
    mode: 'selected',
    selectedFiles: selected,
    reason: `${direct} direct + ${coverage} Playwright coverage + ${dependencies} dependencies + ${sample} sample = ${selected.length} total`,
    shardTotalOverride,
  })
  writeSelection(selection)

  if (selection.skip === 'true') {
    appendSummary(
      `## Playwright Test Selection\n\n**Mode:** Skip - no affected tests\n${planCommentSummary(plan.comment)}`,
    )
    return
  }

  appendSummary(
    [
      '## Playwright Test Selection',
      '',
      '| Bucket | Count |',
      '| --- | --- |',
      `| Directly changed | ${direct} |`,
      `| Playwright coverage related | ${coverage} |`,
      `| Dependency-related | ${dependencies} |`,
      `| Safety sample | ${sample} |`,
      `| **Total selected** | **${selected.length}** of ${plan.total} |`,
      '',
      'Planner artifacts: `playwright-test-plan.json`, `playwright-test-plan.md`',
      '',
      planCommentSummary(plan.comment),
      '<details><summary>Selected files</summary>',
      '',
      selection.files.map(f => `- \`${f}\``).join('\n'),
      '</details>',
      '',
      plan.warnings.length > 0 ? `Warnings:\n${plan.warnings.map(w => `- ${w}`).join('\n')}\n` : '',
    ].join('\n'),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
