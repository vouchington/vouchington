import { splitIds } from './workflow-topology-policy-builders.mts'

// Area workflows run every area job and its coverage fan-ins; nightly.yml calls every area.
const areaCallers = (job: string): string =>
  ['backend', 'cloudflare-worker', 'lambdas', 'tooling', 'web']
    .map(area => `.github/workflows/${area}.yml#${job}`)
    .join(' ')

export const exactCallerJobs = {
  '.github/workflows/backend.yml': splitIds('.github/workflows/nightly.yml#backend'),
  '.github/workflows/cleanup-artifacts.yml': splitIds(
    '.github/workflows/main-checks.yml#cleanup-artifacts .github/workflows/main-web.yml#cleanup-artifacts',
  ),
  '.github/workflows/ci-area-coverage.yml': splitIds(areaCallers('coverage')),
  '.github/workflows/ci-detect-changes.yml': splitIds(
    `.github/workflows/ci.yml#detect-changes ${areaCallers('changes')}`,
  ),
  '.github/workflows/ci-test-coverage.yml': splitIds('.github/workflows/ci.yml#test-coverage'),
  '.github/workflows/ci-upload-codecov.yml': splitIds(areaCallers('codecov')),
  '.github/workflows/ci-tests-processing.yml': splitIds(
    '.github/workflows/ci.yml#tests-processing',
  ),
  '.github/workflows/cloudflare-worker.yml': splitIds(
    '.github/workflows/nightly.yml#cloudflare-worker',
  ),
  '.github/workflows/build-backend.yml': splitIds(
    '.github/workflows/backend.yml#build-backend .github/workflows/ci.yml#build-backend',
  ),
  '.github/workflows/publish-backend-images.yml': splitIds(
    '.github/workflows/main-backend.yml#publish-backend-images',
  ),
  '.github/workflows/build-web.yml': splitIds(
    '.github/workflows/ci.yml#build-web .github/workflows/web.yml#build-web',
  ),
  '.github/workflows/publish-web-images.yml': splitIds(
    '.github/workflows/main-web.yml#publish-web-images',
  ),
  '.github/workflows/checks-static.yml': splitIds(
    '.github/workflows/backend.yml#static-backend .github/workflows/ci.yml#static-backend .github/workflows/ci.yml#static-cloudflare-worker .github/workflows/ci.yml#static-lambdas .github/workflows/ci.yml#static-web .github/workflows/cloudflare-worker.yml#static-cloudflare-worker .github/workflows/lambdas.yml#static-lambdas .github/workflows/main-backend.yml#static-checks .github/workflows/main-cloudflare-worker.yml#static-checks .github/workflows/main-lambdas.yml#static-checks .github/workflows/main-web.yml#static-checks .github/workflows/web.yml#static-web',
  ),
  '.github/workflows/checks-backend-smoke.yml': splitIds(
    '.github/workflows/backend.yml#backend-smoke .github/workflows/ci.yml#backend-smoke .github/workflows/main-backend.yml#backend-smoke',
  ),
  '.github/workflows/harness-dispatch.yml': splitIds(
    '.github/workflows/fix-dependabot.yml#dispatch .github/workflows/fix-issue.yml#dispatch .github/workflows/fix-main.yml#dispatch .github/workflows/merge-queue-ejection.yml#dispatch .github/workflows/plan.yml#dispatch .github/workflows/shepherd.yml#dispatch .github/workflows/scheduled-prompts.yml#dispatch',
  ),
  '.github/workflows/explain-analyze.yml': splitIds(
    '.github/workflows/backend.yml#test-explain-analyze .github/workflows/ci.yml#test-explain-analyze .github/workflows/main-checks.yml#explain-analyze',
  ),
  '.github/workflows/initialize-smoke-test.yml': splitIds(
    '.github/workflows/ci.yml#initialize-smoke-test .github/workflows/tooling.yml#initialize-smoke-test',
  ),
  '.github/workflows/lambdas.yml': splitIds('.github/workflows/nightly.yml#lambdas'),
  '.github/workflows/static-code-analysis.yml': splitIds(
    '.github/workflows/ci.yml#static-code-analysis .github/workflows/static.yml#static-code-analysis',
  ),
  '.github/workflows/static.yml': splitIds('.github/workflows/nightly.yml#static'),
  '.github/workflows/storybook.yml': splitIds(
    '.github/workflows/ci.yml#storybook .github/workflows/main-storybook.yml#storybook-build .github/workflows/web.yml#storybook',
  ),
  '.github/workflows/tests-backend-credentialed.yml': splitIds(
    '.github/workflows/backend.yml#test-backend-credentialed .github/workflows/ci.yml#test-backend-credentialed .github/workflows/main-backend.yml#test-backend-credentialed',
  ),
  '.github/workflows/tests-backend-modules.yml': splitIds(
    '.github/workflows/backend.yml#test-backend-modules .github/workflows/ci.yml#test-backend-modules .github/workflows/main-backend.yml#test-backend-modules',
  ),
  '.github/workflows/tests-backend-unit.yml': splitIds(
    '.github/workflows/backend.yml#test-backend-unit .github/workflows/ci.yml#test-backend-unit .github/workflows/main-backend.yml#test-backend-unit',
  ),
  '.github/workflows/tests-cloudflare-worker.yml': splitIds(
    '.github/workflows/ci.yml#test-cloudflare-worker .github/workflows/cloudflare-worker.yml#test-cloudflare-worker .github/workflows/main-cloudflare-worker.yml#cloudflare-worker-tests',
  ),
  '.github/workflows/tests-lambdas.yml': splitIds(
    '.github/workflows/ci.yml#test-lambdas .github/workflows/lambdas.yml#test-lambdas .github/workflows/main-lambdas.yml#lambdas-tests',
  ),
  '.github/workflows/tests-playwright-credentialed.yml': splitIds(
    '.github/workflows/ci.yml#test-playwright-credentialed .github/workflows/main-web.yml#playwright-credentialed-tests .github/workflows/web.yml#test-playwright-credentialed',
  ),
  '.github/workflows/tests-playwright.yml': splitIds(
    '.github/workflows/ci.yml#test-playwright .github/workflows/main-web.yml#playwright-tests .github/workflows/web.yml#test-playwright',
  ),
  '.github/workflows/tests-portability.yml': splitIds(
    '.github/workflows/ci.yml#test-portability .github/workflows/tooling.yml#test-portability',
  ),
  '.github/workflows/tests-postgres-schema.yml': splitIds(
    '.github/workflows/backend.yml#test-postgres-schema .github/workflows/ci.yml#test-postgres-schema .github/workflows/main-backend.yml#postgres-schema-tests',
  ),
  '.github/workflows/tests-tooling.yml': splitIds(
    '.github/workflows/ci.yml#test-tooling .github/workflows/main-checks.yml#tooling-tests .github/workflows/tooling.yml#test-tooling',
  ),
  '.github/workflows/tests-ts-shared.yml': splitIds(
    '.github/workflows/ci.yml#test-ts-shared .github/workflows/main-checks.yml#ts-shared-tests .github/workflows/tooling.yml#test-ts-shared',
  ),
  '.github/workflows/tests-web-integration.yml': splitIds(
    '.github/workflows/ci.yml#test-web-integration .github/workflows/main-web.yml#test-web-integration .github/workflows/web.yml#test-web-integration',
  ),
  '.github/workflows/tests-web-api.yml': splitIds(
    '.github/workflows/ci.yml#test-web-api .github/workflows/main-web.yml#test-web-api .github/workflows/web.yml#test-web-api',
  ),
  '.github/workflows/tests-web.yml': splitIds(
    '.github/workflows/ci.yml#test-web .github/workflows/main-web.yml#test-web .github/workflows/web.yml#test-web',
  ),
  '.github/workflows/tooling.yml': splitIds('.github/workflows/nightly.yml#tooling'),
  '.github/workflows/web.yml': splitIds('.github/workflows/nightly.yml#web'),
} satisfies Record<string, readonly string[]>
