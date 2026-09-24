import {
  backendCredentialedProviderSmokeTestTransientRule,
  mainBackendCredentialedProviderAndUnitWorkerExitTransientRule,
} from './backend-credentialed-rules.mts'
import {
  backendUnitValkeyGlideTimeoutRule,
  backendUnitVitestWorkerExitAfterPassRule,
} from './backend-test-rules.mts'
import {
  cloudflareWorkerCancelledBeforeJobSignalRule,
  workflowCancelledWithoutFailureSignalRule,
} from './ci-cancelled-rules.mts'
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
import {
  mainWebPlaywrightSetupAptLockRule,
  mainWebPlaywrightWorkerNavigationTimeoutRule,
} from './playwright-rules.mts'
import { runnerShutdownLeafRerunRule } from './runner-shutdown-rules.mts'
import {
  cloudflareWorkerTscRuntimeCrashRule,
  staticAnalysisOxlintTsgolintRuntimeFaultRule,
} from './static-analysis-rules.mts'
import { storybookBrowserStartupTransientRule } from './storybook-rules.mts'
import type { TransientRetryRule } from './types.mts'
import { mainWebStaticBuildSilentExitRule } from './web-build-rules.mts'
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
  lintLinksGithub5xxRule,
  lintLinksSetupLycheeDownloadFlakeRule,
  detectChangesPathsFilterGithub5xxRule,
  gitleaksInstallReleasesDownloadFlakeRule,
  mainBackendCredentialedProviderAndUnitWorkerExitTransientRule,
  backendCredentialedProviderSmokeTestTransientRule,
  backendUnitValkeyGlideTimeoutRule,
  backendUnitVitestWorkerExitAfterPassRule,
  mainWebPlaywrightSetupAptLockRule,
  mainWebPlaywrightWorkerNavigationTimeoutRule,
  mainWebIntegrationBackendSilentStartupExitRule,
  webIntegrationWranglerSocketClosedRule,
  coverageTransportExhaustedRule,
  coverageArtifactDownloadTimeoutRule,
  coverageArtifactStaleRerunMissingRule,
  runnerShutdownLeafRerunRule,
  mainWebStaticBuildSilentExitRule,
  mainWebVitestWorkerStartTimeoutAfterPassRule,
  storybookBrowserStartupTransientRule,
  webVitestSigsegvRule,
  cloudflareWorkerTscRuntimeCrashRule,
  staticAnalysisOxlintTsgolintRuntimeFaultRule,
]
