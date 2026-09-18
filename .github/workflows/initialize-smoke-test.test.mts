import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  jobs?: Record<
    string,
    {
      steps?: Array<{
        env?: Record<string, string>
        name?: string
        run?: string
        shell?: string
        uses?: string
      }>
    }
  >
}

const trustedTreeRestoreCommand = `rm -f -- .git/index
git config --worktree --unset-all core.sparseCheckout || true
git config --worktree --unset-all core.sparseCheckoutCone || true
git config --unset-all core.sparseCheckout || true
git config --unset-all core.sparseCheckoutCone || true
git read-tree --empty
git reset --hard HEAD
`

function readWorkflow(): Workflow {
  return load(readFileSync('.github/workflows/initialize-smoke-test.yml', 'utf8')) as Workflow
}

function stepRun(name: string): string {
  const matchingStep = workflowStep(name)
  expect(matchingStep?.run).toBeTypeOf('string')
  return matchingStep?.run ?? ''
}

function workflowStep(name: string) {
  return readWorkflow().jobs?.['initialize-smoke-test']?.steps?.find(step => step.name === name)
}

describe('initialize-smoke-test workflow', () => {
  it('clears repository and worktree sparse-checkout state before restoring the root tree', () => {
    const run = stepRun('Restore checked-out tree')

    expect(run).toContain('git config --worktree --unset-all core.sparseCheckout || true')
    expect(run).toContain('git config --worktree --unset-all core.sparseCheckoutCone || true')
    expect(run).toContain('git config --unset-all core.sparseCheckout || true')
    expect(run).toContain('git config --unset-all core.sparseCheckoutCone || true')
  })

  it('repairs the checkout before consuming tracked files', () => {
    const steps = readWorkflow().jobs?.['initialize-smoke-test']?.steps ?? []
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout@'))

    expect(checkoutIndex).toBeGreaterThanOrEqual(0)
    expect(steps[checkoutIndex + 1]).toEqual({
      name: 'Restore checked-out tree',
      shell: 'bash',
      run: trustedTreeRestoreCommand,
    })
  })

  it('materializes the linked worktree from the trusted tree with a complete index', () => {
    const run = stepRun('Prepare disposable worktree')
    const create = run.indexOf('git worktree add --detach "$smoke_worktree" HEAD')
    const restore = run.indexOf('git -C "$smoke_worktree" reset --hard HEAD')

    expect(create).toBeGreaterThanOrEqual(0)
    expect(restore).toBeGreaterThan(create)
    expect(run).toContain('rm -f -- "$smoke_index"')
    expect(run).toContain('git -C "$smoke_worktree" read-tree --empty')
  })

  it('activates pnpm in a per-job bin directory before initialize runs nvm', () => {
    const run = stepRun('Activate pnpm via corepack')

    expect(run).toContain('pnpm_prefix="${RUNNER_TEMP:-$HOME/.local}/pnpm"')
    expect(run).toContain('"${node_bin}/corepack" enable --install-directory "$pnpm_bin"')
    expect(run).toContain('npm install --global --prefix "$pnpm_prefix" "pnpm@${pnpm_version}"')
    expect(run).toContain('pnpm --version')
    expect(run).not.toContain('nvm install')
    expect(run).not.toContain('nvm use')
  })

  it.each([
    ['Initialize monorepo', 'cd "$SMOKE_WORKTREE" && ./dev/initialize monorepo'],
    ['Initialize backend', 'cd "$SMOKE_WORKTREE" && ./dev/initialize backend'],
    ['Initialize web', 'cd "$SMOKE_WORKTREE" && ./dev/initialize web'],
  ])('keeps %s on the setup-node runtime instead of runner-local nvm', (name, run) => {
    const step = workflowStep(name)

    expect(step?.env).toMatchObject({
      SKIP_NVM_INSTALL: '1',
    })
    expect(step?.run).toBe(run)
  })

  it('uses the docker-created postgres role for apt-based Postgres setup', () => {
    const run = stepRun('Ensure PostgreSQL is available')

    expect(run).toContain('export PGUSER=postgres')
    expect(run).toContain('POSTGRES_INITDB_ARGS="-c max_connections=300"')
    expect(run).toContain('source "$SMOKE_WORKTREE/dev/lib/worktree-resource-env.sh"')
    expect(run).toContain('smoke_db_name=$(worktree_resource_owned_db_name "$SMOKE_WORKTREE")')
    expect(run).toContain(
      'export DATABASE_URL="postgres://postgres@localhost:${PGPORT}/${smoke_db_name}"',
    )
    expect(run).toContain('echo "DATABASE_URL=$DATABASE_URL"')
    expect(run).not.toContain('echo "PGHOST=$PGHOST"')
    expect(run).not.toContain('echo "PGPORT=$PGPORT"')
    expect(run).not.toContain('echo "PGUSER=$PGUSER"')
    expect(run).not.toContain('export PGUSER="$USER"')
    expect(run).not.toContain('createuser -h localhost -U postgres -s "$USER"')
    expect(run).not.toContain('SMOKE_WORKTREE#*/worktrees/')
    expect(run).not.toContain('smoke_sanitized_dir')
  })

  it('supplies synthetic image buckets to full web initialization', () => {
    expect(workflowStep('Initialize web')?.env).toMatchObject({
      S3_BUCKET_IMAGES: 'initialize-smoke-images',
      S3_BUCKET_IMAGE_UPLOADS: 'initialize-smoke-image-uploads',
    })
  })

  it('initializes backend capability between Postgres setup and full web initialization', () => {
    const steps = readWorkflow().jobs?.['initialize-smoke-test']?.steps ?? []
    const postgres = steps.findIndex(step => step.name === 'Ensure PostgreSQL is available')
    const backend = steps.findIndex(step => step.name === 'Initialize backend')
    const web = steps.findIndex(step => step.name === 'Initialize web')

    expect(postgres).toBeGreaterThanOrEqual(0)
    expect(backend).toBeGreaterThan(postgres)
    expect(web).toBeGreaterThan(backend)
  })

  it('does not need S3 credentials for backend-only initialization', () => {
    expect(workflowStep('Initialize backend')?.env).not.toHaveProperty('S3_AWS_ACCESS_KEY_ID')
    expect(workflowStep('Initialize backend')?.env).not.toHaveProperty('S3_BUCKET_IMAGES')
  })
})
