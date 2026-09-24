import { spawnSync } from 'node:child_process'

import { isRecord } from './core.mts'
import { gitEnvForCwd } from './github-configured-base.mts'
import { type CheckoutRepo, stackCheckoutRepo } from './github-stack-checkout-repo.mts'

/** The hook could not tell which repository gh-stack reads, so it read no stack. */
export const UNRESOLVED_REPOSITORY = Symbol('unresolved repository')

/**
 * Every stack `gh stack checkout <number>` could import; undefined when a stack read is unreadable,
 * or UNRESOLVED_REPOSITORY when the repository is.
 */
export type StackCheckoutResolver = (
  cwd: string,
  env: Record<string, string | undefined>,
  number: number,
  deadline: number,
) => unknown[] | typeof UNRESOLVED_REPOSITORY | undefined

// A read GitHub answered with a 200 (its JSON body) or a 404. Undefined is a read the hook cannot
// trust: any other status, unparseable output, a spawn failure, or one the deadline cut short.
type ApiRead = { found: true; body: unknown } | { found: false }

type LayeredStack = Record<string, unknown> & { pull_requests: unknown[] }

function ghApiRead(
  cwd: string,
  env: Record<string, string | undefined>,
  repo: CheckoutRepo,
  path: string,
  deadline: number,
): ApiRead | undefined {
  const timeout = deadline - Date.now()
  if (timeout <= 0) {
    return undefined
  }
  const result = spawnSync('gh', ['api', '--include', ...repo.hostArgs, `${repo.path}/${path}`], {
    cwd,
    encoding: 'utf8',
    env,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout,
  })
  if (result.error !== undefined || result.status === null) {
    return undefined
  }
  const status = /^HTTP\/[\d.]+ (\d{3})\b/.exec(result.stdout)?.[1]
  if (status === '404') {
    return { found: false }
  }
  const headerEnd = /\r?\n\r?\n/.exec(result.stdout)
  if (status !== '200' || result.status !== 0 || headerEnd === null) {
    return undefined
  }
  try {
    return {
      found: true,
      body: JSON.parse(result.stdout.slice(headerEnd.index + headerEnd[0].length)),
    }
  } catch {
    return undefined
  }
}

function hasLayers(stack: unknown): stack is LayeredStack {
  return isRecord(stack) && Array.isArray(stack.pull_requests) && stack.pull_requests.length > 0
}

/**
 * Mirrors gh-stack's resolveNumericTarget. It reads `<number>` as a stack number first, and falls
 * back to the first stack `stacks?pull_request=<number>` lists whenever that stack read fails for
 * any reason, a transient one included, or the stack has no layers. So the hook returns every stack
 * the checkout could import: stack N when it has layers, and PR N's stack when PR N is stacked. A
 * status other than 200 or 404 on either read, or a stack whose number or membership does not
 * match, makes the target unreadable. The reads go to the repository gh-stack reads.
 */
export function defaultResolveStackForCheckout(
  cwd: string,
  env: Record<string, string | undefined>,
  number: number,
  deadline: number,
): unknown[] | typeof UNRESOLVED_REPOSITORY | undefined {
  const ghEnv = { ...gitEnvForCwd(), ...env }
  const repo = stackCheckoutRepo(cwd, ghEnv, deadline)
  if (repo === undefined) {
    return UNRESOLVED_REPOSITORY
  }
  const read = (path: string) => ghApiRead(cwd, ghEnv, repo, path, deadline)
  const byNumber = read(`stacks/${number}`)
  if (byNumber === undefined) {
    return undefined
  }
  const byPull = read(`stacks?pull_request=${number}`)
  if (byPull === undefined || (byPull.found && !Array.isArray(byPull.body))) {
    return undefined
  }
  const candidates: LayeredStack[] = []
  if (byNumber.found && hasLayers(byNumber.body)) {
    if (byNumber.body.number !== number) {
      return undefined
    }
    candidates.push(byNumber.body)
  }
  // gh-stack imports the first listed stack, and only once it has confirmed that stack holds PR N.
  const [pullStack] = byPull.found ? (byPull.body as unknown[]) : []
  if (pullStack === undefined) {
    return candidates.length > 0 ? candidates : undefined
  }
  if (
    !hasLayers(pullStack) ||
    !pullStack.pull_requests.some(layer => isRecord(layer) && layer.number === number)
  ) {
    return undefined
  }
  return candidates.some(stack => stack.number === pullStack.number)
    ? candidates
    : [...candidates, pullStack]
}
