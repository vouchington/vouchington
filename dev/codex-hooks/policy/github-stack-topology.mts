import { execFileSync } from 'node:child_process'

import type { BlockDecision } from './core.mts'
import { currentBranchName } from './github-configured-base.mts'

// Set this to skip the "you already have an unfinished stack" guard below for a `gh stack init`
// that is genuinely a separate, deliberate stack — e.g.
// `AGENT_STACK_INIT_CONFIRM_SEPARATE=1 gh stack init`. Reconcile first (see
// .agents/skills/stacked-prs/SKILL.md) so the acknowledgment is informed, not reflexive.
const CONFIRM_SEPARATE_STACK_ENV = 'AGENT_STACK_INIT_CONFIRM_SEPARATE'

type StackPullRequest = {
  number?: number
  state?: string
  head?: { ref?: string }
}

type StackListEntry = {
  number?: number
  open?: boolean
  base?: { ref?: string }
  pull_requests?: StackPullRequest[]
}

function isStackListEntry(value: unknown): value is StackListEntry {
  return typeof value === 'object' && value !== null
}

export type StackTopologyResolver = (
  cwd: string,
  env: Record<string, string | undefined>,
) => unknown

function defaultResolveStackTopology(
  cwd: string,
  env: Record<string, string | undefined>,
): unknown {
  try {
    const text = execFileSync('gh', ['api', 'repos/{owner}/{repo}/stacks'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 10_000,
    })
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function layersOf(stack: StackListEntry): StackPullRequest[] {
  return Array.isArray(stack.pull_requests) ? stack.pull_requests : []
}

function describeOpenStack(stack: StackListEntry): string {
  const number = stack.number ?? '?'
  const base = stack.base?.ref ?? 'unknown base'
  const layers = layersOf(stack)
    .map(pr => `#${pr.number ?? '?'} (${pr.state ?? 'unknown'})`)
    .join(', ')
  return `stack #${number} (base ${base}): ${layers === '' ? 'no layers' : layers}`
}

/**
 * Abandonment guard for `gh stack init` (plan #11426/#11439, root cause: agents "make new stacks,
 * forget about the old ones"). Reads the unfiltered `repos/{owner}/{repo}/stacks` list — this must
 * fire across sessions, not just for stacks this session made, so it is deliberately never
 * provenance-filtered. See .agents/skills/stacked-prs/SKILL.md for the reconciliation procedure
 * this guard's reason strings point at.
 */
export function findStackAbandonmentBlock(
  cwd: string,
  env: Record<string, string | undefined>,
  resolveStackTopology: StackTopologyResolver = defaultResolveStackTopology,
): BlockDecision | null {
  const stacks = resolveStackTopology(cwd, env)
  if (!Array.isArray(stacks)) {
    return null
  }
  const openStacks = stacks.filter(
    (stack): stack is StackListEntry => isStackListEntry(stack) && stack.open === true,
  )
  if (openStacks.length === 0) {
    return null
  }

  // The branch is only needed for the "already a layer" comparison below — an unknown branch
  // (e.g. detached HEAD) must not skip the "an unfinished open stack exists" check entirely, or a
  // detached-HEAD `gh stack init` sails through with no signal at all.
  const branch = currentBranchName(cwd)
  const alreadyALayer =
    branch === undefined
      ? undefined
      : openStacks.find(stack => layersOf(stack).some(pr => pr.head?.ref === branch))
  if (alreadyALayer !== undefined) {
    return {
      reason:
        `Branch "${branch}" is already a layer of open ${describeOpenStack(alreadyALayer)}. ` +
        'Use `gh stack add`, not `gh stack init`, to extend an existing stack. ' +
        'See .agents/skills/stacked-prs/SKILL.md.',
    }
  }

  if (env[CONFIRM_SEPARATE_STACK_ENV] === '1' || env[CONFIRM_SEPARATE_STACK_ENV] === 'true') {
    return null
  }

  const summary = openStacks.map(describeOpenStack).join('; ')
  return {
    reason:
      `An unfinished open stack already exists: ${summary}. Reconcile it first — see the ` +
      'reconciliation procedure in .agents/skills/stacked-prs/SKILL.md — before starting a new ' +
      'one; this is usually the "forgot about the old stack" bug, not a deliberate second stack. ' +
      `If this genuinely is a separate, deliberate stack, re-run with ` +
      `${CONFIRM_SEPARATE_STACK_ENV}=1 prefixed once you have reconciled.`,
  }
}
