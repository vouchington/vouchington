import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runInitializeHelper, runInitializeHelperStatus } from '../test-helpers/initialize.mts'

describe('initialize worktree resource registry', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('registers linked siblings across the clone but excludes protected main', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-resource-registry-'))
    testDirs.push(root)
    const home = join(root, 'home')
    const isolatedTmp = join(root, 'isolated-tmp')
    const main = join(root, 'repository')
    const linked = join(root, 'linked')
    await mkdir(join(main, '.git'), { recursive: true })
    await mkdir(home, { recursive: true })
    await mkdir(isolatedTmp, { recursive: true })
    await mkdir(linked, { recursive: true })
    await writeFile(join(linked, '.git'), 'gitdir: /repository/.git/worktrees/linked\n')

    await runInitializeHelper({
      args: [main, linked],
      cwd: main,
      env: { TMPDIR: isolatedTmp },
      home,
      script: `
        linked_worktree=$2
        git_worktree_live_paths() { printf '%s\n%s\n' "$1" "$linked_worktree"; }
        register_live_worktree_resource_paths "$1"
      `,
    })

    const registry = await readFile(join(home, '.voucha', 'worktree-resource-owners'), 'utf8')
    expect(registry.trim()).toBe(await realpath(linked))
  })

  it('keeps a registered full clone non-main after TMPDIR changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-resource-registry-clone-'))
    testDirs.push(root)
    const home = join(root, 'home')
    const clone = join(root, 'clone')
    const laterTmpdir = join(root, 'later-tmp')
    await mkdir(home, { recursive: true })
    await mkdir(join(clone, '.git'), { recursive: true })
    await mkdir(laterTmpdir, { recursive: true })

    const output = await runInitializeHelper({
      args: [laterTmpdir],
      cwd: clone,
      env: { TMPDIR: clone },
      home,
      script: `
        register_disposable_checkout_path "$PWD"
        register_worktree_resource_path "$PWD"
        export TMPDIR=$1
        if worktree_resource_is_main "$PWD"; then printf main; else printf non-main; fi
      `,
    })

    expect(output).toBe('non-main')
  })

  it('does not make a future protected main checkout disposable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-resource-registry-reuse-'))
    testDirs.push(root)
    const home = join(root, 'home')
    const checkout = join(root, 'checkout')
    const isolatedTmp = join(root, 'isolated-tmp')
    await mkdir(home, { recursive: true })
    await mkdir(checkout, { recursive: true })
    await mkdir(isolatedTmp, { recursive: true })
    await writeFile(join(checkout, '.git'), 'gitdir: /repository/.git/worktrees/checkout\n')

    const output = await runInitializeHelper({
      cwd: checkout,
      env: { TMPDIR: isolatedTmp },
      home,
      script: `
        register_worktree_resource_path "$PWD"
        rm "$PWD/.git"
        mkdir "$PWD/.git"
        if worktree_resource_is_main "$PWD"; then printf main; else printf non-main; fi
      `,
    })

    expect(output).toBe('main')
  })

  it('names the registry path when the registry cannot be written', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-resource-registry-eperm-'))
    testDirs.push(root)
    const home = join(root, 'home')
    const checkout = join(root, 'checkout')
    await mkdir(checkout, { recursive: true })
    await writeFile(home, 'a file where the HOME directory should be')
    await writeFile(join(checkout, '.git'), 'gitdir: /repository/.git/worktrees/checkout\n')

    const result = await runInitializeHelperStatus({
      cwd: checkout,
      home,
      script: 'register_worktree_resource_path "$PWD"',
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(`worktree resource registry at ${join(home, '.voucha')}`)
    expect(result.stderr).toContain('Fix:')
  })

  it('rejects a path where a worktree resource id is expected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-resource-dir-shape-'))
    testDirs.push(root)

    const result = await runInitializeHelperStatus({
      cwd: root,
      script: 'worktree_resource_validate_dir_shape /srv/checkouts/feature',
    })
    const accepted = await runInitializeHelperStatus({
      cwd: root,
      script:
        'worktree_resource_validate_dir_shape d0123456789ab && worktree_resource_validate_dir_shape ""',
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('WORKTREE_DIR must be a worktree resource id')
    expect(result.stderr).toContain('/srv/checkouts/feature')
    expect(result.stderr).toContain('Fix: unset WORKTREE_DIR')
    expect(accepted.code).toBe(0)
  })

  it('names the foreign lock holder and says no marker was written', async () => {
    const root = await mkdtemp(join(tmpdir(), 'voucha-resource-lock-holder-'))
    testDirs.push(root)
    const home = join(root, 'home')
    const lockRoot = join(home, '.voucha', 'worktree-resource-operations')
    await mkdir(lockRoot, { recursive: true })
    await writeFile(join(lockRoot, 'owner.1.1'), `${process.pid}\n`)
    await symlink('owner.1.1', join(lockRoot, 'lock'))

    const result = await runInitializeHelperStatus({
      cwd: root,
      home,
      script: 'worktree_resource_acquire_operation_lock',
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(`held by PID ${process.pid}`)
    expect(result.stderr).toContain('no .initialized marker was written')
  })
})
