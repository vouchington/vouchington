import { parseClosingIssueReferences } from './closing-refs.mts'
import { parseNonClosingRefs } from './non-closing-refs.mts'

export type PlanCompletionPullRequest = {
  body: string
  merged?: boolean
  number: number
  state: string
}

export type PlanCompletionAssessment =
  | { kind: 'none' }
  | { kind: 'stranded-sibling'; sibling: number }
  | { kind: 'unopened-work' }

function relatedIssuesSection(body: string): string {
  const sections = body.split(/^(?=##\s)/m)
  return sections.find(section => /^##\s+Related\s+issues\s*$/im.test(section.split('\n')[0])) ?? ''
}

function referenceKeys(
  body: string,
  repository: string,
): { closing: Set<string>; refs: Set<string> } {
  const localPrefix = `${repository.toLowerCase()}#`
  const normalize = (key: string): string =>
    key.toLowerCase().startsWith(localPrefix)
      ? `#${key.slice(localPrefix.length)}`
      : key.toLowerCase()
  const related = relatedIssuesSection(body)
  return {
    closing: new Set(
      parseClosingIssueReferences(related).map(reference => normalize(reference.key)),
    ),
    refs: new Set([...parseNonClosingRefs(body)].map(normalize)),
  }
}

/**
 * Evaluates only current PR bodies: timeline cross-references are not authoritative because a PR
 * may have been edited since it was merged or linked. A warning requires an already merged sibling
 * so a newly opened Plan does not resemble a stranded completion.
 */
export function assessPlanCompletion({
  number,
  pullRequests,
  repository,
}: {
  number: number
  pullRequests: readonly PlanCompletionPullRequest[]
  repository: string
}): PlanCompletionAssessment {
  const planKey = `#${number}`
  let merged = 0
  const open: Array<{ closing: boolean; number: number }> = []

  for (const pullRequest of pullRequests) {
    const references = referenceKeys(pullRequest.body, repository)
    const closing = references.closing.has(planKey)
    const nonClosing = references.refs.has(planKey)
    if (!closing && !nonClosing) continue
    if (pullRequest.state.toLowerCase() === 'open') {
      open.push({ closing, number: pullRequest.number })
    } else if (pullRequest.merged) {
      merged += 1
    }
  }

  if (merged === 0 || open.length > 1 || open.some(pullRequest => pullRequest.closing)) {
    return { kind: 'none' }
  }
  if (open.length === 1) return { kind: 'stranded-sibling', sibling: open[0]!.number }
  return { kind: 'unopened-work' }
}
