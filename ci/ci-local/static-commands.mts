import type { CiLocalCommand } from './types.mts'
import { WEB_TYPECHECK_ENV, workflowCommand } from './workflow-command.mts'

export const staticCommands: CiLocalCommand[] = [
  workflowCommand(
    'oxlint',
    'pnpm exec oxlint --type-aware --deny-warnings',
    'static-code-analysis.yml',
  ),
  workflowCommand('jscpd', 'pnpm exec jscpd .', 'static-code-analysis.yml'),
  workflowCommand('jscpd dead code', 'pnpm run jscpd:dead-code', 'static-code-analysis.yml'),
  workflowCommand(
    'syncpack',
    'pnpm exec syncpack lint && pnpm exec syncpack format --check',
    'static-code-analysis.yml',
    'pnpm exec syncpack lint',
  ),
  workflowCommand(
    'no-mistakes',
    'pnpm run no-mistakes',
    'static-code-analysis.yml',
    'pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check',
  ),
  workflowCommand(
    'squawk',
    'pnpm exec squawk backend/data-stores/psql/migrations/*.sql backend/data-stores/psql/config-driven/*.sql backend/data-stores/psql/views/*.sql',
    'prepare-postgres.yml',
  ),
  workflowCommand(
    'backend dependency-cruiser',
    'pnpm exec depcruise --config backend/.dependency-cruiser.cjs --output-type err backend ts-shared',
    'checks-static.yml',
    'pnpm exec depcruise --config backend/.dependency-cruiser.cjs --output-type err',
  ),
  workflowCommand(
    'web dependency-cruiser',
    'pnpm exec depcruise --config web/.dependency-cruiser.cjs --output-type err web',
    'checks-static.yml',
    'pnpm exec depcruise --config web/.dependency-cruiser.cjs --output-type err',
  ),
  workflowCommand(
    'lambda dependency-cruiser',
    'pnpm exec depcruise --config lambdas/.dependency-cruiser.cjs --output-type err lambdas',
    'checks-static.yml',
    'pnpm exec depcruise --config lambdas/.dependency-cruiser.cjs --output-type err',
  ),
  workflowCommand(
    'tooling dependency-cruiser',
    'node static-code-analysis/run-tooling-dependency-cruiser.mts',
    'static-code-analysis.yml',
    'node static-code-analysis/run-tooling-dependency-cruiser.mts',
  ),
  workflowCommand(
    'Playwright dependency-cruiser',
    "pnpm exec depcruise --config .dependency-cruiser.cjs --output-type err --do-not-follow '^(?!playwright/tests/)' playwright/tests",
    'static-code-analysis.yml',
    '--do-not-follow "^(?!playwright/tests/)" playwright/tests',
  ),
  workflowCommand(
    'scripts typecheck',
    'pnpm exec tsc --noEmit --project tsconfig.json',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'ts-shared typecheck',
    'pnpm exec tsc --noEmit --project ts-shared/tsconfig.json',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'playwright typecheck',
    'pnpm exec tsc --noEmit --project playwright/tsconfig.json',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'test-helpers typecheck',
    'pnpm exec tsc --noEmit --project test-helpers/tsconfig.json',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'integration-tests typecheck',
    'pnpm exec tsc --noEmit --project integration-tests/tsconfig.json',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'knip',
    'pnpm exec knip --treat-config-hints-as-errors',
    'static-code-analysis.yml',
  ),
  workflowCommand('oxfmt', 'pnpm exec oxfmt --check', 'static-code-analysis.yml'),
  workflowCommand('selene', 'pnpm run selene', 'static-code-analysis.yml'),
  workflowCommand(
    'backend typecheck',
    'pnpm exec tsc --noEmit --incremental --project backend/tsconfig.json && pnpm exec tsc --noEmit --project email-templates/tsconfig.json',
    'static-code-analysis.yml',
    'pnpm exec tsc --noEmit --incremental --project backend/tsconfig.json && pnpm exec tsc --noEmit --project email-templates/tsconfig.json',
  ),
  {
    ...workflowCommand(
      'web typecheck',
      'cd web && pnpm exec next typegen && pnpm exec tsc --noEmit --incremental',
      'static-code-analysis.yml',
      'pnpm exec next typegen && pnpm exec tsc --noEmit --incremental',
    ),
    env: WEB_TYPECHECK_ENV,
  },
  workflowCommand(
    'cloudflare-worker typecheck',
    'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'lambdas typecheck',
    'pnpm exec tsc --noEmit --project lambdas/tsconfig.json',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'knip production exports',
    'pnpm run knip:production-exports',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'repo Node static checks',
    'node static-code-analysis/run-node-checks.mts --checks config-inventory-policy,repo-file-policy,scc-complexity,targeted-guardrails',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'dependency license policy',
    'pnpm run dependency-license-policy',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'workspace registry',
    'pnpm exec vouchington workspace-registry-check',
    'static-code-analysis.yml',
  ),
  workflowCommand(
    'live repository policies',
    'node ci/check-repository-policy-scans.mts',
    'static-code-analysis.yml',
  ),
]
