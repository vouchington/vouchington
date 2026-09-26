import { execFile as execFileCallback } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { assessPlanCompletion } from '../dev/pr-description/plan-completion.mts'
import { mapPlanReads } from './plan-completion-batch.mts'
import {
  assertCommentReadback,
  commentBody,
  isCurrentOpenPlan,
  listArgs,
  markerComment,
  openPlans,
  pullRequest,
  readArgs,
} from './plan-completion-data.mts'
import { candidatePullRequestNumbers } from './plan-completion-timeline.mts'

const execFile = promisify(execFileCallback)

type RunGh = (args: string[]) => Promise<string>

async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFile('gh', args, { maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

export async function runPlanCompletionSnapshot({
  repository,
  runGh = gh,
}: {
  repository: string
  runGh?: RunGh
}): Promise<void> {
  const issueJson = await runGh([...listArgs(`repos/${repository}/issues`), '-f', 'state=open'])
  const plans = openPlans(issueJson)
  const candidatesByPlan = new Map(
    await mapPlanReads(
      plans,
      async number =>
        [
          number,
          candidatePullRequestNumbers(
            await runGh(listArgs(`repos/${repository}/issues/${number}/timeline`)),
            repository,
          ),
        ] as const,
    ),
  )
  const candidateNumbers = new Set([...candidatesByPlan.values()].flat())
  const currentPullRequests = new Map(
    await mapPlanReads(
      [...candidateNumbers],
      async number =>
        [
          number,
          pullRequest(await runGh(readArgs(`repos/${repository}/pulls/${number}`)), number),
        ] as const,
    ),
  )
  const activePlans = new Set(
    (
      await mapPlanReads(plans, async number =>
        (await isCurrentOpenPlan(
          await runGh(readArgs(`repos/${repository}/issues/${number}`)),
          number,
        ))
          ? number
          : undefined,
      )
    ).filter((number): number is number => number !== undefined),
  )
  const commentPaths = new Map(
    [...activePlans].map(number => [number, `repos/${repository}/issues/${number}/comments`]),
  )
  // Read every paginated comment list before a write: a partial snapshot must not mutate Plans.
  const markers = new Map(
    await mapPlanReads(
      [...activePlans],
      async number =>
        [number, markerComment(await runGh(listArgs(commentPaths.get(number)!)))] as const,
    ),
  )
  for (const number of plans) {
    if (!activePlans.has(number)) continue
    const advisory = assessPlanCompletion({
      number,
      pullRequests: (candidatesByPlan.get(number) ?? []).flatMap(candidate => {
        const current = currentPullRequests.get(candidate)
        return current ? [current] : []
      }),
      repository,
    })
    const commentsPath = commentPaths.get(number)!
    const existing = markers.get(number)
    if (advisory.kind === 'none' && existing === undefined) continue
    const body = commentBody(number, advisory)
    if (existing?.body === body) continue

    // Re-read immediately before a write so concurrent delivery cannot overwrite another marker.
    const current = markerComment(await runGh(listArgs(commentsPath)))
    if (current?.body === body) continue
    if (current === undefined && advisory.kind === 'none') continue
    if (
      !(await isCurrentOpenPlan(
        await runGh(readArgs(`repos/${repository}/issues/${number}`)),
        number,
      ))
    ) {
      continue
    }
    if (current === undefined) {
      const created = await runGh(['api', '-X', 'POST', commentsPath, '-f', `body=${body}`])
      const parsed = JSON.parse(created) as { id?: unknown }
      if (typeof parsed.id !== 'number') throw new Error('Created comment response is missing id')
      assertCommentReadback(
        await runGh(readArgs(`repos/${repository}/issues/comments/${parsed.id}`)),
        parsed.id,
        body,
      )
    } else {
      await runGh([
        'api',
        '-X',
        'PATCH',
        `repos/${repository}/issues/comments/${current.id}`,
        '-f',
        `body=${body}`,
      ])
      assertCommentReadback(
        await runGh(readArgs(`repos/${repository}/issues/comments/${current.id}`)),
        current.id,
        body,
      )
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) throw new Error('GITHUB_REPOSITORY is required')
  await runPlanCompletionSnapshot({ repository })
}
