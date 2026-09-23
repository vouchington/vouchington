import { execFileSync } from 'node:child_process'

import { type BlockDecision, isRecord } from './core.mts'
import { type CheckoutLayer, staleLayerBranches } from './github-stack-checkout-branches.mts'

const SHA_PATTERN = /^[0-9a-f]{40}$/

const TARGET_REASON =
  'gh stack checkout takes exactly one stack number, PR number, or PR URL: ' +
  '`gh stack checkout <stack-number>`. The bare form is an interactive picker, and a branch-name ' +
  'target resolves only against stacks this worktree already tracks. See ' +
  '.agents/skills/stacked-prs/SKILL.md.'

export type StackCheckoutResolver = (
  cwd: string,
  env: Record<string, string | undefined>,
  number: number,
) => unknown

function positiveInteger(text: string | undefined): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) {
    return undefined
  }
  const number = Number(text)
  return number > 0 ? number : undefined
}

/**
 * The number gh-stack resolves for `gh stack checkout <target>`. A PR URL follows gh-stack's
 * parsePRURL: any host, path `/<owner>/<repo>/pull/<n>`. gh-stack discards the URL's owner and repo
 * and resolves the number against the current checkout's repository, so the guard does the same.
 */
export function stackCheckoutTargetNumber(optionTokens: string[]): number | undefined {
  if (optionTokens.length !== 1) {
    return undefined
  }
  const [target] = optionTokens
  if (/^\d+$/.test(target)) {
    return positiveInteger(target)
  }
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return undefined
  }
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (url.host === '' || parts.length < 4 || parts[2] !== 'pull') {
    return undefined
  }
  return positiveInteger(parts[3])
}

// The resolver makes up to three calls inside the harness's 30s hook timeout, and a timed-out hook
// does not block the command, so the calls together must finish well inside it.
const GH_API_TIMEOUT_MS = 5_000

function ghApiJson(cwd: string, env: Record<string, string | undefined>, path: string): unknown {
  try {
    const text = execFileSync('gh', ['api', path], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GH_API_TIMEOUT_MS,
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
): unknown {
  const stack = ghApiJson(cwd, env, `repos/{owner}/{repo}/stacks/${number}`)
  if (hasLayers(stack)) {
    return stack
  }
  const pull = ghApiJson(cwd, env, `repos/{owner}/{repo}/pulls/${number}`)
  const stackNumber = isRecord(pull) && isRecord(pull.stack) ? pull.stack.number : undefined
  if (typeof stackNumber !== 'number') {
    return undefined
  }
  return ghApiJson(cwd, env, `repos/{owner}/{repo}/stacks/${stackNumber}`)
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
    if (!isRecord(layer) || (layer.merged_at !== null && typeof layer.merged_at !== 'string')) {
      return undefined
    }
    if (layer.merged_at !== null) {
      continue
    }
    const head = isRecord(layer.head) ? layer.head : {}
    if (
      typeof layer.number !== 'number' ||
      typeof head.ref !== 'string' ||
      typeof head.sha !== 'string' ||
      !SHA_PATTERN.test(head.sha)
    ) {
      return undefined
    }
    layers.push({ pr: layer.number, ref: head.ref, sha: head.sha })
  }
  return { number: typeof stack.number === 'number' ? stack.number : undefined, layers }
}

/**
 * `gh stack checkout <n>` is the only gh-stack command that imports an existing remote stack into
 * this worktree's local record, but it keeps existing local layer branches as they are. A later
 * `gh stack rebase` then starts from stale commits, so the checkout is allowed only once every
 * existing local layer branch matches its PR head. Fails closed: the checkout itself needs the same
 * API, so blocking an unreadable stack costs nothing an allowed checkout would have delivered.
 */
export function findStackCheckoutBlock(
  optionTokens: string[],
  cwd: string | undefined,
  env: Record<string, string | undefined>,
  resolveStack: StackCheckoutResolver = defaultResolveStackForCheckout,
): BlockDecision | null {
  const target = stackCheckoutTargetNumber(optionTokens)
  if (target === undefined) {
    return { reason: TARGET_REASON }
  }
  if (cwd === undefined) {
    return {
      reason:
        'gh stack checkout needs a working directory the hook can resolve, so it can compare local ' +
        'layer branches with their PR heads. Run it from the worktree directly, without an ' +
        'unresolved `cd`.',
    }
  }
  const stack = unmergedLayers(resolveStack(cwd, env, target))
  if (stack === undefined) {
    return {
      reason:
        `gh stack checkout ${target}: the hook could not resolve ${target} to a stack whose layers ` +
        'and PR heads it can read, so it cannot verify the local layer branches. Check that ' +
        `${target} is a stack number or a stacked PR (\`gh api "repos/{owner}/{repo}/pulls/${target}" ` +
        "--jq '.stack.number'`); if the GitHub API was unreachable, retry once it is.",
    }
  }
  const stale = staleLayerBranches(cwd, stack.layers)
  if (stale.length === 0) {
    return null
  }
  const summary =
    `gh stack checkout ${target} would import stack #${stack.number ?? '?'} with stale local ` +
    'layer branches. gh-stack keeps existing local branches as they are, so the next ' +
    '`gh stack rebase` would start from stale commits. Fix each branch, then rerun the checkout:'
  return { reason: `${summary}\n${stale.join('\n')}` }
}
