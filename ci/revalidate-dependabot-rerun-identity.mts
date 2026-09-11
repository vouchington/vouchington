export interface DependabotRerunInputs {
  eventHeadSha: string
  headBranch: string
  prNumber: number
  repository: string
  rerunJobId: number | null
  sourceRunAttempt: number
  sourceRunConclusion: string
  sourceRunId: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function exactSourceIdentity(source: unknown, inputs: DependabotRerunInputs): boolean {
  if (!isObject(source)) return false
  const actor = source.actor
  const headRepository = source.head_repository
  const pullRequests = source.pull_requests

  return (
    source.event === 'pull_request' &&
    isObject(actor) &&
    actor.login === 'dependabot[bot]' &&
    isObject(headRepository) &&
    headRepository.full_name === inputs.repository &&
    source.head_branch === inputs.headBranch &&
    source.head_sha === inputs.eventHeadSha &&
    Array.isArray(pullRequests) &&
    pullRequests.length === 1 &&
    isObject(pullRequests[0]) &&
    pullRequests[0].number === inputs.prNumber
  )
}

export function pullRequestState(
  value: unknown,
  inputs: DependabotRerunInputs,
): 'advanced' | 'closed' | 'current' | 'invalid' {
  if (!isObject(value)) return 'invalid'
  const user = value.user
  const head = value.head
  if (
    value.number !== inputs.prNumber ||
    !isObject(user) ||
    user.login !== 'dependabot[bot]' ||
    !isObject(head) ||
    !isObject(head.repo) ||
    head.ref !== inputs.headBranch ||
    head.repo.full_name !== inputs.repository ||
    typeof head.sha !== 'string' ||
    !/^[a-f0-9]{40}$/i.test(head.sha)
  )
    return 'invalid'
  if (value.state === 'closed') return 'closed'
  if (value.state !== 'open') return 'invalid'
  return head.sha === inputs.eventHeadSha ? 'current' : 'advanced'
}
