/**
 * Checked-in inventory of every GitHub Actions secret name referenced anywhere under
 * `.github/workflows/**`. `workflow-secrets-policy.test.mts` asserts this set is exactly the
 * set of names the workflow topology finds referenced (workflow/job/step-scope
 * `secretReferences`, which also covers explicit `workflow_call` secret-binding values) — so
 * a PR that adds, removes, or renames a `secrets.*` reference must touch this file, forcing a
 * deliberate call on whether the name is provisioned.
 *
 * `provisioned` records intended state, not a live read of GitHub's secret store — that live
 * comparison is `dev/verify-workflow-secrets.mts` (trusted/local-only; see #8157).
 *
 * Security constraint (#8157): entries and the diagnostics built from them expose secret
 * NAMES and PRESENCE only. Nothing here reads, fetches, or holds a secret's value — GitHub
 * Actions expressions in workflow YAML are static text (`${{ secrets.NAME }}`), never
 * resolved values, so there is no value for this file or its consumers to leak.
 */
export interface SecretInventoryEntry {
  /** True once this name is provisioned as a real GitHub secret (repo, environment, or organization scope). */
  readonly provisioned: boolean
  /**
   * Require this secret to exist only in the named GitHub Environment, never as a repository,
   * alternate environment, or organization secret. The required Environment must permit only
   * the `main` branch to deploy, preventing a branch-controlled workflow from reading a protected
   * job's credential.
   */
  readonly requiredEnvironment?: string
  /**
   * Require this GitHub Environment's deployment branch policy to permit only `main`, without
   * also requiring the secret itself to live in that Environment. Use this instead of
   * `requiredEnvironment` when the secret is intentionally repository-scoped (e.g. because
   * `workflow_call` does not resolve Environment-scoped secrets) but a same-named Environment is
   * still kept around purely to enforce the main-only branch-policy gate on the jobs that
   * consume it. `requiredSecretScopeViolations` additionally asserts a `provisioned` entry here
   * exists as a repository secret and nowhere in any Environment's secret set or as an
   * organization secret.
   */
  readonly requiredBranchPolicy?: string
  /**
   * True when this name must never become a real GitHub secret — a generic contract-only
   * placeholder (e.g. a `workflow_call` secret name every caller rebinds to its own real key).
   * `dev/verify-workflow-secrets.mts` reports a live match here as `accidentallyProvisioned`
   * rather than ordinary drift, since flipping `provisioned` to true would be the wrong fix.
   */
  readonly neverProvision?: boolean
  readonly notes: string
}

export const SECRET_INVENTORY = {
  AWS_OTEL_STORE_ROLE_ARN: {
    provisioned: true,
    notes: 'AWS role used only for optional Playwright telemetry storage (repo secret).',
  },
  AWS_OTEL_STORE_URI: {
    provisioned: true,
    notes: 'S3 prefix used only for optional Playwright telemetry storage (repo secret).',
  },
  AWS_TEST_ROLE_ARN: {
    provisioned: true,
    notes: 'AWS role used by credentialed tests and validation builds (repo secret).',
  },
  DEPENDABOT_AUTOMERGE_TOKEN: {
    provisioned: true,
    notes: 'PAT for Dependabot automerge and dependency-bump PR pushes (repo secret).',
  },
  HARNESS_API_KEY: {
    provisioned: true,
    // Repo-scoped by design: workflow_call does not resolve Environment-scoped secrets. The
    // auto-harness Environment is kept solely to enforce the main-only branch-policy gate below,
    // tracked independently via requiredBranchPolicy rather than requiredEnvironment.
    requiredBranchPolicy: 'auto-harness',
    notes:
      'Auto Harness operator API key (repo secret). Environment-scoped secrets do not resolve ' +
      'inside a workflow_call-invoked job per live canary #10196 (docs claim job-level ' +
      'environment is sufficient but empirically empty); each caller explicitly forwards this ' +
      'one name via secrets: { HARNESS_API_KEY: ... }, never secrets: inherit. The dispatch job ' +
      'still declares environment: auto-harness for its main-only branch-policy gate, ' +
      'independent of secret scope. Operator rollout note: the auto-harness environment copy ' +
      'of this secret must be deleted only after the repository copy is confirmed present ' +
      '(verified 2026-08-26: environment copy already removed, repo copy is the sole source ' +
      'of truth going forward).',
  },
  OPENAI_API_KEY: {
    provisioned: true,
    notes: 'OpenAI key for credentialed backend/Playwright tests (repo secret).',
  },
  OPENCODE_FREE_API_KEY: {
    provisioned: true,
    notes:
      'OpenCode Zen API key for the advisory OpenCode PR review (repo secret), forwarded to ' +
      'the reusable opencode-code-review workflow via secrets: { code_review_api_key: ... }. ' +
      'Not actually live yet on this personal-account repo (manual rollout step) — marked ' +
      'true because the caller job is a stepless uses: job with no readiness step to add; ' +
      'ci/check-live-workflow-topology.mts enforces this (confirmed empirically, false trips ' +
      'unprovisionedSecretsWithoutReadinessStep here). The vars.*_CODE_REVIEW_ENABLED gate is ' +
      'what actually keeps this never-red before the secret exists.',
  },
  OPENROUTER_FREE_API_KEY: {
    provisioned: true,
    notes:
      'OpenRouter API key for the advisory OpenCode and Claude OpenRouter PR reviews (repo secret). ' +
      'Forwarded to the reusable opencode-code-review workflow via secrets: { code_review_api_key: ... } ' +
      'and to the reusable code-review workflow (the Claude-harness reviewer via ' +
      "OpenRouter's Anthropic Skin, running thinkingmachines/inkling:free as of #11267; " +
      'previously minimax/minimax-m3:free, retired after OpenRouter dropped its serving ' +
      'endpoints) via secrets: ' +
      '{ provider_api_token: ... } from claude-openrouter-code-reviewer.yml. Both reviewers draw from the ' +
      'same OpenRouter free-tier quota/rate-limit pool, unlike the Zen + OpenRouter split across ' +
      'providers/keys elsewhere in this file — a throttling event on that pool degrades both ' +
      'reviewers together; re-split into separate keys if that correlated failure is observed in ' +
      'practice. Marked provisioned: true because both caller jobs are stepless uses: jobs with ' +
      'no readiness step to add; ci/check-live-workflow-topology.mts enforces this (confirmed ' +
      'empirically, false trips unprovisionedSecretsWithoutReadinessStep here) regardless of ' +
      'whether either gating var is currently on. Each reviewer is gated on its own ' +
      'vars.*_CODE_REVIEW_ENABLED var, which is what actually keeps this never-red before or ' +
      "after the secret is drawn on — gating lives in the workflow (vars.CLAUDE_OPENROUTER_CODE_REVIEW_ENABLED == 'true', " +
      'unset by default); permanent enablement is via the repo var, confirmed live via a canary ' +
      'run with vars.MINIMAX_CODE_REVIEW_ENABLED temporarily set (2026-09-06); the var is unset ' +
      'by default and managed outside this repo.',
  },
  S3_BUCKET_IMAGES: {
    provisioned: true,
    notes: 'S3 bucket used by credentialed image tests (repo secret).',
  },
  S3_BUCKET_IMAGE_UPLOADS: {
    provisioned: true,
    notes:
      'Dedicated test-only staging S3 bucket used by credentialed image upload tests (repo secret). ' +
      'Provision it from the vouchington-infra image_uploads_test_bucket output before the rollout. ' +
      'Marked provisioned because ci.yml forwards it from a stepless reusable-workflow job, ' +
      'which cannot host a readiness step; the called workflow performs the explicit preflight.',
  },
  STRIPE_SECRET_KEY: {
    provisioned: true,
    notes: 'Stripe secret key for credentialed backend tests (repo secret).',
  },
  VOUCHINGTON_INFRA_APP_ID: {
    provisioned: true,
    notes:
      'GitHub App ID for short-lived repository dispatch tokens scoped to vouchington-infra; ' +
      'stored as a repository secret.',
  },
  VOUCHINGTON_INFRA_APP_PRIVATE_KEY: {
    provisioned: true,
    notes:
      'Private key for the repository-scoped vouchington-infra dispatch App; stored as a repository secret.',
  },
} satisfies Record<string, SecretInventoryEntry>
