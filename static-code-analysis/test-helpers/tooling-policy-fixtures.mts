import { stringify } from 'yaml'

/** Finite aggregate foundation, authored here rather than copied from the live repository. */
export async function writeValidToolingPolicyFixture(
  track: (path: string, content: string) => Promise<void>,
) {
  const roots = [
    '.agents',
    '.claude',
    '.codex',
    '.github',
    'api-fixtures',
    'articles',
    'ast-grep-rules',
    'backend',
    'ci',
    'cloudflare-worker',
    'dev',
    'docs',
    'dotnet-clients',
    'email-templates',
    'integration-tests',
    'lambdas',
    'localization',
    'native',
    'playwright',
    'seed',
    'static-code-analysis',
    'swift-clients',
    'test-helpers',
    'ts-shared',
    'web',
  ]
  await track(
    '.no-mistakes.yml',
    stringify({
      rules: [
        {
          rule: 'package-json-workspace-coverage',
          options: { requireNamedPackage: true, packageRoots: roots },
        },
        {
          rule: 'postgres-no-generated-column-writes',
          options: { sqlInclude: ['backend/data-stores/psql/migrations/**/*.sql'] },
        },
        ...Array.from({ length: 2 }, () => ({
          rule: 'postgres-generated-column-predicates',
          options: { requireArgumentIsPrimaryKey: false },
        })),
      ],
    }),
  )
  await track('pnpm-workspace.yaml', stringify({ packages: roots.map(root => `${root}/**`) }))
  await track('.trivyignore.yaml', 'vulnerabilities: []\n')
  const gate =
    'trivy filesystem --scanners vuln --quiet --skip-db-update --pkg-types os --exit-code "$TRIVY_FINDINGS_EXIT_CODE" --severity CRITICAL,HIGH --ignore-unfixed --ignorefile .trivyignore.yaml --format table --table-mode detailed --output report.txt target'
  const sbom =
    'trivy filesystem --quiet --skip-db-update --exit-code 0 --format cyclonedx --output sbom.json target'
  await track(
    '.github/workflows/main.yml',
    stringify(
      { jobs: { scan: { steps: [gate, gate, sbom, sbom].map(run => ({ run })) } } },
      { lineWidth: 0 },
    ),
  )
}
