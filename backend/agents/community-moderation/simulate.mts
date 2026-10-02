import type { ClassifierExternalContentPart } from '@agents/classifiers/safe-content'
import type {
  CommunityAgentPrompt,
  CommunityAgentPromptSimulationPost,
} from '@services/community-agent-prompts'
import pMap from 'p-map'
import { prepareCommunityPromptDryRun, type CommunityPromptDryRunDependencies } from './dry-run.mts'

export interface CommunityPromptSimulationResult {
  post_id: string
  flagged: boolean
  /**
   * Always the empty string: the classifier answers with a probability, not a reason. Typed as a
   * plain string so the published response schema keeps the field it always had.
   */
  reason: string
}

/** What one preview post costs to read: title and body share this many characters. */
const MAX_SIMULATION_POST_INPUT_CHARS = 4000
/** Provider calls in flight at once; the simulation's post cap bounds the total. */
const SIMULATION_CONCURRENCY = 8

type SimulationOptions = CommunityPromptDryRunDependencies & {
  /** Previews this text instead of the stored rule. */
  promptOverride?: string
}

/**
 * Previews one community rule over a sample of posts as a classifier dry run: one yes/no call per
 * post, as production asks it, so the flags match what a real run would conclude. Nothing is
 * persisted; the first failed call (a provider error, a timeout or the daily spend cap) fails the
 * whole preview and cancels the calls still in flight.
 */
export async function simulateCommunityPromptOnPosts(
  prompt: Pick<CommunityAgentPrompt, 'id' | 'community_id' | 'prompt'>,
  posts: readonly CommunityAgentPromptSimulationPost[],
  options: SimulationOptions = {},
): Promise<CommunityPromptSimulationResult[]> {
  if (posts.length === 0) return []
  const { promptOverride, ...dependencies } = options
  const dryRun = await prepareCommunityPromptDryRun(
    {
      communityId: prompt.community_id,
      prompt: { id: prompt.id, text: promptOverride ?? prompt.prompt },
    },
    dependencies,
  )
  const cancelInFlight = new AbortController()
  try {
    return await pMap(
      posts,
      async post => {
        const { flagged } = await dryRun.classify(simulationParts(post), cancelInFlight.signal)
        return { post_id: post.id, flagged, reason: '' }
      },
      { concurrency: SIMULATION_CONCURRENCY },
    )
  } catch (err) {
    cancelInFlight.abort(err)
    throw err
  }
}

function simulationParts(
  post: CommunityAgentPromptSimulationPost,
): ClassifierExternalContentPart[] {
  const parts: ClassifierExternalContentPart[] = []
  let remaining = MAX_SIMULATION_POST_INPUT_CHARS
  if (post.title.trim()) {
    const content = truncate(post.title, remaining)
    parts.push({ content, isTitle: true })
    remaining -= content.length
  }
  if (post.markdown.trim() && remaining > 0) {
    parts.push({ content: truncate(post.markdown, remaining) })
  }
  return parts
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`
}
