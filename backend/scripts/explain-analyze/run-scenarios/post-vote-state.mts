import { runCurrentPostVoteReadScenarios } from './current-post-vote-reads.mts'
import { runPostVoteStateTransitionScenarios } from './post-vote-state-transitions.mts'
import { runUserDeletionPostVoteStateScenario } from './user-deletion-post-vote-state.mts'

export async function runPostVoteStateScenarios(): Promise<void> {
  await runPostVoteStateTransitionScenarios()
  await runCurrentPostVoteReadScenarios()
  await runUserDeletionPostVoteStateScenario()
}
