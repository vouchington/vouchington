const EXTERNAL_WORKFLOW_ENV_ALLOWLIST = new Set([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_MODEL',
  // AWS CLI v2 checksum behavior flags, read by the `aws` binary itself during `aws s3 sync` against
  // R2's S3-compatible endpoint, not by repo TypeScript code.
  'AWS_REQUEST_CHECKSUM_CALCULATION',
  'AWS_RESPONSE_CHECKSUM_VALIDATION',
  // Git commit identity — consumed by git directly, not by TypeScript code.
  // Set in commit-creating workflows such as pnpm-dedupe.
  // Enforced pattern documented in .github/workflows/AUTHORING.md § Fixed-Branch Automation PRs.
  'GIT_AUTHOR_EMAIL',
  'GIT_AUTHOR_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_COMMITTER_NAME',
  // Consumed by git itself during pnpm-dedupe's authenticated push. This
  // TypeScript-focused inventory cannot see git.
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
  'CI_PROJECT',
  'CI_SHARD',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLOUDFLARE_ACCOUNT_ID',
  'COVERAGE_BASE',
  'COVERAGE_HEAD',
  'COVERAGE_PR',
  'COVERAGE_REPO',
  // Read through dependency-free Harness/checkpoint CLIs' typed environment parameters. This
  // checker intentionally does not treat generic `environment.NAME` property reads as global
  // process-environment readers, so keep the exact workflow-to-CLI fields explicit here.
  'CHECKPOINT_STATUS',
  // Read through buildHarnessDispatchMetadata()'s typed HarnessMetadataEnvironment parameter in
  // ci/harness-session-dispatch-metadata.mts — same `environment.NAME` blind spot as
  // CHECKPOINT_STATUS above.
  'AGENT_REF',
  'ALLOW_DUPLICATE_ISSUE_COMPLETION',
  'CHECKPOINT_ISSUE_NUMBER',
  'COMPLETION_MODE',
  'EXISTING_ISSUE_MAINTENANCE',
  'EXPECTED_HEAD_SHA',
  'PR_LABEL',
  'PUBLISH_BASE_REF',
  'PUBLISH_CONTRACT',
  'PUBLISH_DUPLICATE_KEY',
  'PUBLISH_RELATED_CANDIDATES',
  'PUBLISH_TARGET_PR_NUMBER',
  'PUBLISH_TITLE_PREFIX',
  'PUBLISH_TITLE_SUFFIX',
  'SLACK_SOURCE',
  'DOCKER_BUILD_SUMMARY',
  'DOCKER_CLI_EXPERIMENTAL',
  'HARNESS_CONCURRENCY_ID',
  'HARNESS_PRIORITY',
  'HARNESS_PROMPT',
  'HARNESS_QUEUE_TTL_SECONDS',
  'HARNESS_REF',
  'HARNESS_REQUIRED_LABELS',
  'HARNESS_RESUME_SESSION_ID',
  'HARNESS_TIMEOUT',
  'NODE_V8_COVERAGE',
  // Standard env var (https://no-color.org) read by wrangler itself, not repo TypeScript code; keeps
  // the deploy step's Current Version ID scrape free of ANSI escape codes.
  'NO_COLOR',
  'OTEL_OUTPUT_ROOT',
  'OTEL_STORE_URI',
  'PAT_TOKEN',
  'POSTGRES_DB',
  'POSTGRES_HOST_AUTH_METHOD',
  // Official postgres image initdb flag consumed by the service/container entrypoint, not repo TypeScript.
  'POSTGRES_INITDB_ARGS',
  'POSTGRES_USER',
  'PUSH',
  'RUN_NUMBER',
  // Read through required(env, 'VITEST_REPORT_EXPECTATIONS') in the report-preparation CLI. This
  // dynamic NodeJS.ProcessEnv lookup is intentionally not matched by the static reader patterns.
  'VITEST_REPORT_EXPECTATIONS',
  // Read as env.VITEST_SELECTED_FILES in vitestArgs() (ci/storybook-browser-runner-env.mts). The
  // env.NAME reader pattern is scoped to cloudflare-worker/ files only, so this generic
  // NodeJS.ProcessEnv parameter read isn't traced.
  'VITEST_SELECTED_FILES',
])

// Consumed by the build-backend-images / build-web-images composite actions, which read
// env.IMAGE_REPOSITORY and env.SHA_TAG as inherited job env rather than declared `with:` inputs.
// These callers no longer reference the names in their own file text (their build steps moved
// into the composite action), and this checker only scans the workflow file it found the `env:`
// map in — it does not trace into a `uses: ./.github/actions/*` step's own YAML.
const IMAGE_BUILD_ENV_WORKFLOWS = new Set([
  '.github/workflows/build-backend.yml',
  '.github/workflows/build-web.yml',
])
const IMAGE_BUILD_ENV_ALLOWLIST = new Set(['IMAGE_REPOSITORY', 'SHA_TAG'])

export function isWorkflowEnvAllowlisted(file: string, name: string): boolean {
  if (EXTERNAL_WORKFLOW_ENV_ALLOWLIST.has(name)) return true

  return IMAGE_BUILD_ENV_WORKFLOWS.has(file) && IMAGE_BUILD_ENV_ALLOWLIST.has(name)
}
