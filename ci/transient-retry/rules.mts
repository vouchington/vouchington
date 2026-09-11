import {
  backendCredentialedProviderSmokeTestTransientRule,
  mainBackendCredentialedProviderAndUnitWorkerExitTransientRule,
} from './backend-credentialed-rules.mts'
import {
  backendUnitValkeyGlideTimeoutRule,
  backendUnitVitestWorkerExitAfterPassRule,
} from './backend-test-rules.mts'
import { backendSmokeReservedPortCollisionRule } from './backend-port-collision-rules.mts'
import {
  cloudflareWorkerCancelledBeforeJobSignalRule,
  workflowCancelledWithoutFailureSignalRule,
} from './ci-cancelled-rules.mts'
import {
  cleanWorkspaceVouchingtonToolingDownloadFlakeRule,
  playwrightSelectCleanWorkspaceFetchTimeoutRule,
} from './clean-workspace-rules.mts'
import {
  coverageArtifactDownloadTimeoutRule,
  coverageArtifactStaleRerunMissingRule,
  coverageTransportExhaustedRule,
} from './coverage-artifact-rules.mts'
import { detectChangesPathsFilterGithub5xxRule } from './detect-changes-rules.mts'
import { gitleaksInstallReleasesDownloadFlakeRule } from './gitleaks-rules.mts'
import {
  lintLinksGithub5xxRule,
  lintLinksSetupLycheeDownloadFlakeRule,
} from './lint-links-rules.mts'
import { playwrightSetupBackendPnpmActivationTimeoutRule } from './package-install-rules.mts'
import {
  mainWebPlaywrightSetupAptLockRule,
  mainWebPlaywrightWorkerNavigationTimeoutRule,
} from './playwright-rules.mts'
import {
  mainWebPlaywrightReservedPortCollisionRule,
  playwrightCredentialedWebServerReservedPortCollisionRule,
} from './playwright-port-collision-rules.mts'
import { runnerDiskAdmissionRejectedRule } from './runner-disk-admission-rules.mts'
import { runnerShutdownLeafRerunRule } from './runner-shutdown-rules.mts'
import {
  cloudflareWorkerTscRuntimeCrashRule,
  staticAnalysisCheckoutDiskExhaustionRule,
  staticAnalysisOxlintTsgolintRuntimeFaultRule,
} from './static-analysis-rules.mts'
import { storybookBrowserStartupTransientRule } from './storybook-rules.mts'
import type { TransientRetryRule } from './types.mts'
import {
  mainWebBuildWebTargetsAcquireTimeoutRule,
  mainWebStaticBuildAcquireTimeoutRule,
} from './web-build-acquire-timeout-rules.mts'
import {
  mainWebBuildWebTargetsWatchdogTimeoutRule,
  mainWebStaticBuildWatchdogTimeoutRule,
  mainWebStaticBuildSilentExitRule,
} from './web-build-rules.mts'
import {
  mainWebIntegrationBackendSilentStartupExitRule,
  webIntegrationWranglerSocketClosedRule,
} from './web-integration-rules.mts'
import {
  mainWebVitestWorkerStartTimeoutAfterPassRule,
  webVitestSigsegvRule,
} from './web-vitest-rules.mts'

export type { TransientRetryRule, WorkflowRunContext } from './types.mts'

export const RULES: TransientRetryRule[] = [
  cloudflareWorkerCancelledBeforeJobSignalRule,
  workflowCancelledWithoutFailureSignalRule,
  runnerDiskAdmissionRejectedRule,
  cleanWorkspaceVouchingtonToolingDownloadFlakeRule,
  lintLinksGithub5xxRule,
  lintLinksSetupLycheeDownloadFlakeRule,
  detectChangesPathsFilterGithub5xxRule,
  gitleaksInstallReleasesDownloadFlakeRule,
  mainBackendCredentialedProviderAndUnitWorkerExitTransientRule,
  backendCredentialedProviderSmokeTestTransientRule,
  backendSmokeReservedPortCollisionRule,
  backendUnitValkeyGlideTimeoutRule,
  backendUnitVitestWorkerExitAfterPassRule,
  playwrightSetupBackendPnpmActivationTimeoutRule,
  mainWebPlaywrightSetupAptLockRule,
  mainWebPlaywrightReservedPortCollisionRule,
  playwrightCredentialedWebServerReservedPortCollisionRule,
  mainWebPlaywrightWorkerNavigationTimeoutRule,
  mainWebIntegrationBackendSilentStartupExitRule,
  webIntegrationWranglerSocketClosedRule,
  coverageTransportExhaustedRule,
  coverageArtifactDownloadTimeoutRule,
  coverageArtifactStaleRerunMissingRule,
  runnerShutdownLeafRerunRule,
  mainWebBuildWebTargetsWatchdogTimeoutRule,
  mainWebBuildWebTargetsAcquireTimeoutRule,
  mainWebStaticBuildWatchdogTimeoutRule,
  mainWebStaticBuildAcquireTimeoutRule,
  mainWebStaticBuildSilentExitRule,
  mainWebVitestWorkerStartTimeoutAfterPassRule,
  storybookBrowserStartupTransientRule,
  playwrightSelectCleanWorkspaceFetchTimeoutRule,
  webVitestSigsegvRule,
  staticAnalysisCheckoutDiskExhaustionRule,
  cloudflareWorkerTscRuntimeCrashRule,
  staticAnalysisOxlintTsgolintRuntimeFaultRule,
]
