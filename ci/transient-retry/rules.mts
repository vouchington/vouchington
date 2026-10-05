import { backendCredentialedProviderSmokeTestTransientRule } from './backend-credentialed-rules.mts'
import { mainBackendImageRegistryLayerBlobNotFoundRule } from './backend-image-rules.mts'
import {
  cloudflareWorkerCancelledBeforeJobSignalRule,
  workflowCancelledWithoutFailureSignalRule,
} from './ci-cancelled-rules.mts'
import {
  detectChangesPathsFilterGithub5xxRule,
  detectChangesPathsFilterGithubConnectTimeoutRule,
} from './detect-changes-rules.mts'
import { gitleaksInstallReleasesDownloadFlakeRule } from './gitleaks-rules.mts'
import {
  lintLinksGithub5xxRule,
  lintLinksSetupLycheeDownloadFlakeRule,
} from './lint-links-rules.mts'
import { planCompletionSetupNodeToolCacheTimeoutRule } from './plan-completion-rules.mts'
import { mainWebPlaywrightSetupAptLockRule } from './playwright-rules.mts'
import { runnerShutdownLeafRerunRule } from './runner-shutdown-rules.mts'
import {
  cloudflareWorkerTscRuntimeCrashRule,
  staticAnalysisOxlintTsgolintRuntimeFaultRule,
} from './static-analysis-rules.mts'
import { storybookBrowserStartupTransientRule } from './storybook-rules.mts'
import type { TransientRetryRule } from './types.mts'
import { webIntegrationWranglerSocketClosedRule } from './web-integration-rules.mts'
import { webVitestSigsegvRule } from './web-vitest-rules.mts'

export type { TransientRetryRule, WorkflowRunContext } from './types.mts'

export const RULES: TransientRetryRule[] = [
  cloudflareWorkerCancelledBeforeJobSignalRule,
  workflowCancelledWithoutFailureSignalRule,
  lintLinksGithub5xxRule,
  lintLinksSetupLycheeDownloadFlakeRule,
  detectChangesPathsFilterGithub5xxRule,
  detectChangesPathsFilterGithubConnectTimeoutRule,
  gitleaksInstallReleasesDownloadFlakeRule,
  planCompletionSetupNodeToolCacheTimeoutRule,
  mainBackendImageRegistryLayerBlobNotFoundRule,
  backendCredentialedProviderSmokeTestTransientRule,
  mainWebPlaywrightSetupAptLockRule,
  webIntegrationWranglerSocketClosedRule,
  runnerShutdownLeafRerunRule,
  storybookBrowserStartupTransientRule,
  webVitestSigsegvRule,
  cloudflareWorkerTscRuntimeCrashRule,
  staticAnalysisOxlintTsgolintRuntimeFaultRule,
]
