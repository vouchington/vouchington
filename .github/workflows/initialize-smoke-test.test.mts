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
        uses?: string
      }>
    }
  >
}

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
  it('initializes inside a linked worktree so dev resources get worktree-scoped names', () => {
    const run = stepRun('Prepare disposable worktree')

    expect(run).toContain('git worktree add --detach "$smoke_worktree" HEAD')
    expect(run).toContain('if [ ! -f "$smoke_worktree/.git" ]; then')
    expect(run).toContain('*/worktrees/*) ;;')
    expect(run).toContain('echo "SMOKE_WORKTREE=$smoke_worktree" >> "$GITHUB_ENV"')
  })

  it('activates the .nvmrc Node and then pnpm before initialize runs', () => {
    const steps = readWorkflow().jobs?.['initialize-smoke-test']?.steps ?? []
    const node = steps.findIndex(step => step.uses?.startsWith('actions/setup-node@'))
    const pnpm = steps.findIndex(step => step.uses?.startsWith('pnpm/action-setup@'))
    const initialize = steps.findIndex(step => step.name === 'Initialize monorepo')

    expect(node).toBeGreaterThan(-1)
    expect(pnpm).toBeGreaterThan(node)
    expect(initialize).toBeGreaterThan(pnpm)
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

  it('uses the docker-created postgres role for Postgres setup', () => {
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
