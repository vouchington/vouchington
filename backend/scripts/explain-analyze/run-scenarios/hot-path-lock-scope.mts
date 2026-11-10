import { runFollowCycleCasScenarios } from './follow-cycle-cas.mts'
import {
  seedBlueskyAuthorityCorpus,
  cleanupBlueskyAuthorityCorpus,
} from './bluesky-authority-corpus.mts'
import { runBlueskyAuthoritySnapshotScenario } from './bluesky-authority-snapshot.mts'
import { runApiKeyAdmissionScenarios } from './api-key-admission.mts'
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
    await runContentAuthoritySnapshotScenarios()
    await runOAuthAuthorityScenarios()
    await runActivityPubVoteAuthorityScenarios()
    await runFollowCycleCasScenarios()
    await runLockScopeDomainScenarios()
    await runProviderOwnerSnapshotScenarios()
  } finally {
    await cleanupBlueskyAuthorityCorpus(noise)
  }
}
