import { execFileSync } from 'node:child_process'

import { type BlockDecision, isRecord } from './core.mts'
import { type CheckoutLayer, staleLayerBranches } from './github-stack-checkout-branches.mts'
import {
  isStandaloneStackCheckout,
  STANDALONE_CHECKOUT_REASON,
} from './github-stack-checkout-shape.mts'

const SHA_PATTERN = /^[0-9a-f]{40}$/

const TARGET_REASON =
  'gh stack checkout takes exactly one stack number or PR number: ' +
  '`gh stack checkout <stack-number>`. The bare form is an interactive picker, and a branch-name ' +
  'target resolves only against stacks this worktree already tracks. See ' +
  '.agents/skills/stacked-prs/SKILL.md.'

// The whole guard (API reads and git reads) must finish inside the harness's 30s hook timeout,
// because a timed-out hook does not block the command. The hook's own cold start on a trivial
// command measures well under a second, so 20s leaves margin on a loaded machine.
const CHECKOUT_BUDGET_MS = 20_000

export type StackCheckoutResolver = (
  cwd: string,
  env: Record<string, string | undefined>,
  number: number,
  deadline: number,
) => unknown

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function stackCheckoutTargetNumber(optionTokens: string[]): number | undefined {
  const [target] = optionTokens
  if (optionTokens.length !== 1 || !/^[1-9]\d*$/.test(target)) {
    return undefined
  }
  const number = Number(target)
  return isPositiveSafeInteger(number) ? number : undefined
}

function ghApiJson(
  cwd: string,
  env: Record<string, string | undefined>,
  path: string,
  deadline: number,
): unknown {
  const timeout = deadline - Date.now()
  if (timeout <= 0) {
    return undefined
  }
  try {
    const text = execFileSync('gh', ['api', path], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout,
    })
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function hasLayers(stack: unknown): boolean {
  return isRecord(stack) && Array.isArray(stack.pull_requests) && stack.pull_requests.length > 0
}

// Same order as gh-stack's resolveNumericTarget: the number as a stack number first, then as a PR
// number whose stack GitHub reports.
function defaultResolveStackForCheckout(
  cwd: string,
  env: Record<string, string | undefined>,
  number: number,
  deadline: number,
): unknown {
  const stack = ghApiJson(cwd, env, `repos/{owner}/{repo}/stacks/${number}`, deadline)
  if (hasLayers(stack)) {
    return stack
  }
  const pull = ghApiJson(cwd, env, `repos/{owner}/{repo}/pulls/${number}`, deadline)
  const stackNumber = isRecord(pull) && isRecord(pull.stack) ? pull.stack.number : undefined
  if (!isPositiveSafeInteger(stackNumber)) {
    return undefined
  }
  return ghApiJson(cwd, env, `repos/{owner}/{repo}/stacks/${stackNumber}`, deadline)
}

type ResolvedStack = { number: number | undefined; layers: CheckoutLayer[] }

// Unmerged layers only: gh-stack skips merged branches when it rebases. A layer whose merge state or
// head cannot be read makes the whole stack unreadable, so the guard never approves a partial read.
function unmergedLayers(stack: unknown): ResolvedStack | undefined {
  if (!hasLayers(stack) || !isRecord(stack)) {
    return undefined
  }
  const layers: CheckoutLayer[] = []
  for (const layer of stack.pull_requests as unknown[]) {
    if (!isRecord(layer) || (layer.merged_at !== null && !isNonEmptyString(layer.merged_at))) {
      return undefined
    }
    if (layer.merged_at !== null) {
      continue
    }
    const head = isRecord(layer.head) ? layer.head : {}
    if (
      !isPositiveSafeInteger(layer.number) ||
      !isNonEmptyString(head.ref) ||
      typeof head.sha !== 'string' ||
      !SHA_PATTERN.test(head.sha)
    ) {
      return undefined
    }
    layers.push({ pr: layer.number, ref: head.ref, sha: head.sha })
  }
  return { number: isPositiveSafeInteger(stack.number) ? stack.number : undefined, layers }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

/**
 * `gh stack checkout <n>` is the only gh-stack command that imports an existing remote stack into
 * this worktree's local record, but it keeps existing local layer branches as they are. A later
 * `gh stack rebase` then starts from stale commits, so the checkout is allowed only once every
 * existing local layer branch matches its PR head. Fails closed: the checkout itself needs the same
 * API and repository, so blocking an unreadable stack costs nothing an allowed checkout would have
 * delivered.
 */
export function findStackCheckoutBlock(
  command: string,
  optionTokens: string[],
  cwd: string | undefined,
  env: Record<string, string | undefined>,
  resolveStack: StackCheckoutResolver = defaultResolveStackForCheckout,
): BlockDecision | null {
  const deadline = Date.now() + CHECKOUT_BUDGET_MS
  const target = stackCheckoutTargetNumber(optionTokens)
  if (target === undefined) {
    return { reason: TARGET_REASON }
  }
  if (!isStandaloneStackCheckout(command) || cwd === undefined) {
    return { reason: STANDALONE_CHECKOUT_REASON }
  }
  const stack = unmergedLayers(resolveStack(cwd, env, target, deadline))
  if (stack === undefined) {
    return {
      reason:
        `gh stack checkout ${target}: the hook could not resolve ${target} to a stack whose layers ` +
        'and PR heads it can read, so it cannot verify the local layer branches. Check that ' +
        `${target} is a stack number or a stacked PR (\`gh api "repos/{owner}/{repo}/pulls/${target}" ` +
        "--jq '.stack.number'`); if the GitHub API was unreachable, retry once it is.",
    }
  }
  const stale = staleLayerBranches(cwd, stack.layers, deadline)
  if (stale === undefined) {
    return {
      reason:
        `gh stack checkout ${target}: the hook could not read the local layer branches in ${cwd} ` +
        '(git failed there, or the hook ran out of time), so it cannot verify them. Check that the ' +
        'directory is a worktree of this repository, then retry.',
    }
  }
  if (stale.length === 0) {
    return null
  }
  const summary =
    `gh stack checkout ${target} would import stack #${stack.number ?? '?'} with stale local ` +
    'layer branches. gh-stack keeps existing local branches as they are, so the next ' +
    '`gh stack rebase` would start from stale commits. Fix each branch, then rerun the checkout:'
  return { reason: `${summary}\n${stale.join('\n')}` }
}
