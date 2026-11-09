import { runUserDeletionPostVoteStateScenario } from './user-deletion-post-vote-state.mts'
import { runCurrentPostVoteReadScenarios } from './current-post-vote-reads.mts'
import { runPostVoteStateTransitionScenarios } from './post-vote-state-transitions.mts'
import { runFollowCycleCasScenarios } from './follow-cycle-cas.mts'
import { runLandingPageItemReplacementScenarios } from './landing-page-item-replacement.mts'
import {
  seedBlueskyAuthorityCorpus,
  cleanupBlueskyAuthorityCorpus,
} from './bluesky-authority-corpus.mts'
import { runBlueskyAuthoritySnapshotScenario } from './bluesky-authority-snapshot.mts'
import { runApiKeyAdmissionScenarios } from './api-key-admission.mts'
import { runOAuthFriendRepairScenario } from './oauth-friend-repair.mts'
import { runContentAuthoritySnapshotScenarios } from './content-authority-snapshot.mts'
import { runOAuthAuthorityScenarios } from './oauth-authority.mts'
import { runActivityPubVoteAuthorityScenarios } from './activitypub-vote-authority.mts'
import { runProviderOwnerSnapshotScenarios } from './provider-owner-snapshots.mts'
import { runLockScopeDomainScenarios } from './lock-scope-domains.mts'

export async function runHotPathLockScopeScenarios(): Promise<void> {
  const noise = await seedBlueskyAuthorityCorpus()
  try {
    await runBlueskyAuthoritySnapshotScenario()
    await runApiKeyAdmissionScenarios()
    await runOAuthFriendRepairScenario()
    await runContentAuthoritySnapshotScenarios()
    await runOAuthAuthorityScenarios()
    await runActivityPubVoteAuthorityScenarios()
    await runPostVoteStateTransitionScenarios()
    await runCurrentPostVoteReadScenarios()
    await runUserDeletionPostVoteStateScenario()
    await runFollowCycleCasScenarios()
    await runLandingPageItemReplacementScenarios()
    await runLockScopeDomainScenarios()
    await runProviderOwnerSnapshotScenarios()
  } finally {
    await cleanupBlueskyAuthorityCorpus(noise)
  }
}
