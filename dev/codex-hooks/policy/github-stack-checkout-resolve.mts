import { spawnSync } from 'node:child_process'

import { isRecord } from './core.mts'

/** Every stack `gh stack checkout <number>` could import, or undefined when the hook cannot tell. */
export type StackCheckoutResolver = (
  cwd: string,
  env: Record<string, string | undefined>,
  number: number,
  deadline: number,
) => unknown[] | undefined

// A read GitHub answered with a 200 (its JSON body) or a 404. Undefined is a read the hook cannot
// trust: any other status, unparseable output, a spawn failure, or one the deadline cut short.
type ApiRead = { found: true; body: unknown } | { found: false }

type LayeredStack = Record<string, unknown> & { pull_requests: unknown[] }

function ghApiRead(
  cwd: string,
  env: Record<string, string | undefined>,
  path: string,
  deadline: number,
): ApiRead | undefined {
  const timeout = deadline - Date.now()
  if (timeout <= 0) {
    return undefined
  }
  const result = spawnSync('gh', ['api', '--include', path], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
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

function positiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : undefined
}

/**
 * Mirrors gh-stack's resolveNumericTarget, which reads `<number>` as a stack number first and falls
 * back to PR `<number>`'s stack whenever that stack read fails for any reason, a transient one
 * included, or the stack has no layers. So the hook returns every stack the checkout could import:
 * stack N when it has layers, and PR N's stack when PR N is stacked. A status other than 200 or 404
 * on any read, or a stack whose number or membership does not match, makes the target unreadable.
 */
export function defaultResolveStackForCheckout(
  cwd: string,
  env: Record<string, string | undefined>,
  number: number,
  deadline: number,
): unknown[] | undefined {
  const read = (path: string) => ghApiRead(cwd, env, `repos/{owner}/{repo}/${path}`, deadline)
  const byNumber = read(`stacks/${number}`)
  if (byNumber === undefined) {
    return undefined
  }
  const pull = read(`pulls/${number}`)
  if (pull === undefined || (pull.found && !isRecord(pull.body))) {
    return undefined
  }
  const candidates: LayeredStack[] = []
  if (byNumber.found && hasLayers(byNumber.body)) {
    if (byNumber.body.number !== number) {
      return undefined
    }
    candidates.push(byNumber.body)
  }
  const pullStack = pull.found && isRecord(pull.body) ? pull.body.stack : null
  if (pullStack === null || pullStack === undefined) {
    return candidates.length > 0 ? candidates : undefined
  }
  const stackNumber = isRecord(pullStack) ? positiveInteger(pullStack.number) : undefined
  if (stackNumber === undefined) {
    return undefined
  }
  if (candidates.some(stack => stack.number === stackNumber)) {
    return candidates
  }
  const fallback = read(`stacks/${stackNumber}`)
  if (
    !fallback?.found ||
    !hasLayers(fallback.body) ||
    fallback.body.number !== stackNumber ||
    !fallback.body.pull_requests.some(layer => isRecord(layer) && layer.number === number)
  ) {
    return undefined
  }
  return [...candidates, fallback.body]
}
