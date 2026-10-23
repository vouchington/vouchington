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
  // Enforced by the fixed-branch automation PR workflows.
  'GIT_AUTHOR_EMAIL',
  'GIT_AUTHOR_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_COMMITTER_NAME',
  // Consumed by git itself during pnpm-dedupe's authenticated push. This
  // TypeScript-focused inventory cannot see git.
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
  // The published vouchington-tooling GHCR retention script reads these values; its npm package
  // source is outside the repository inventory, and the cleanup workflow passes them directly.
  'GHCR_KEEP_MAIN',
  'GHCR_OWNER',
  'GHCR_OWNER_TYPE',
  'GHCR_PACKAGES',
  'GHCR_UNMERGED_MIN_AGE_DAYS',
  'CI_PROJECT',
  'CI_SHARD',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLOUDFLARE_ACCOUNT_ID',
  'COVERAGE_AREA',
  'COVERAGE_BASE',
  'COVERAGE_HEAD',
  'COVERAGE_PR',
  'COVERAGE_REPO',
  // Read through the checkpoint CLI's typed environment parameter.
  'CHECKPOINT_STATUS',
  'DOCKER_BUILD_SUMMARY',
  'DOCKER_CLI_EXPERIMENTAL',
  'HARNESS_AGENT_DISPATCH_ENABLED',
  // Node.js consumes this before application code to disable its compile cache for precise V8
  // coverage in the native EXPLAIN preflight; it is not a repository TypeScript environment read.
  'NODE_DISABLE_COMPILE_CACHE',
  'NODE_V8_COVERAGE',
  // Standard env var (https://no-color.org) read by wrangler itself, not repo TypeScript code; keeps
  // the deploy step's Current Version ID scrape free of ANSI escape codes.
  'NO_COLOR',
  'OTEL_OUTPUT_ROOT',
  'PAT_TOKEN',
  'POSTGRES_DB',
  'POSTGRES_HOST_AUTH_METHOD',
  // Official postgres image initdb flag consumed by the service/container entrypoint, not repo TypeScript.
  'POSTGRES_INITDB_ARGS',
  'POSTGRES_USER',
  'PUSH',
  'RUN_NUMBER',
  // Read by vouchington-tooling/storybook-browser-runner to conditionally append coverage argv;
  // the published runner implementation is outside the repository source inventory.
  'STORYBOOK_BROWSER_COVERAGE',
  // Read by vouchington-tooling/vitest-diagnostics ciReporters() and ciOutputFile(); the
  // published reporter implementations are outside the repository source inventory.
  'VITEST_FILE_PROGRESS_FILE',
  'VITEST_JUNIT_OUTPUT_FILE',
  // Read through required(env, 'VITEST_REPORT_EXPECTATIONS') in the report-preparation CLI. This
  // dynamic NodeJS.ProcessEnv lookup is intentionally not matched by the static reader patterns.
  'VITEST_REPORT_EXPECTATIONS',
])

export function isWorkflowEnvAllowlisted(name: string): boolean {
  return EXTERNAL_WORKFLOW_ENV_ALLOWLIST.has(name)
}
