import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { observeFixtureExit } from './test-helpers/run-bounded-exit-observer.mts'
import { createAnalyzerFixtureBudget } from '../static-code-analysis/test-helpers/analyzer-fixture-budget.mts'

// Deliberately holds NoMist's machine-wide lock: run once before other analyzers, not in Vitest.
async function main(): Promise<void> {
  const budget = createAnalyzerFixtureBudget()
  let root: string | undefined
  let observer: ReturnType<typeof observeFixtureExit> | undefined
  let work: ReturnType<typeof budget.check> | undefined
  let settled = false
  let fallbackUsed = false
  let failed = false
  let primary: unknown
  const cleanup: unknown[] = []
  let receipt: object | undefined
  try {
    root = await mkdtemp(join(tmpdir(), 'analyzer-budget-'))
    observer = observeFixtureExit(join(root, 'hook.sock'))
    await observer.listen()
    assert.equal(budget.git(['init', '-q', root]).status, 0)
    await writeFile(join(root, '.no-mistakes.yml'), 'rules: []\n')
    await writeFile(join(root, 'owned.txt'), 'owned\n')
    assert.equal(budget.git(['-C', root, 'add', '.']).status, 0)
    const actorFile = join(root, 'hook-actor.json')
    const hook = join(root, 'fsmonitor')
    await writeFile(
      hook,
      [
        '#!/usr/bin/env node',
        "const net = require('node:net')",
        "const fs = require('node:fs')",
        `fs.writeFileSync(${JSON.stringify(actorFile)}, JSON.stringify({ pid: process.pid, parent: process.ppid, root: process.cwd() }))`,
        "process.on('SIGTERM', () => {})",
        `const socket = net.createConnection(${JSON.stringify(join(root, 'hook.sock'))})`,
        "socket.on('connect', () => socket.write('ready\\n'))",
        "socket.on('end', () => socket.end())",
        'socket.resume()',
      ].join('\n'),
      { mode: 0o700 },
    )
    assert.equal(budget.git(['-C', root, 'config', 'core.fsmonitor', hook]).status, 0)
    work = budget.check(resolve('node_modules/no-mistakes/bin/no-mistakes.js'), root)
    void work.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.race([
      observer.started,
      work.then(result => {
        throw new Error(`Analyzer ended before its owned hook: ${result.stderr}`)
      }),
    ])
    const actor = JSON.parse(await readFile(actorFile, 'utf8')) as {
      pid: number
      parent: number
      root: string
    }
    assert.equal(actor.root, root)
    assert.ok(Number.isInteger(actor.pid) && actor.pid > 0)
    assert.ok(Number.isInteger(actor.parent) && actor.parent > 0)
    const result = await work
    assert.equal(result.status, 124, result.stderr)
    await observer.closed
    assert.equal(observer.error(), undefined)
    assert.equal(budget.actors.length, 1)
    assert.equal(budget.actors[0]?.closed, true)
    receipt = {
      nativeExit: result.status,
      wrapper: budget.actors[0],
      hook: actor,
      hookConnectionClosed: true,
    }
  } catch (err) {
    failed = true
    primary = err
  } finally {
    if ((work && !settled) || observer?.open()) {
      fallbackUsed = true
      const listener = observer?.closeListener()
      try {
        observer?.releaseConnection()
      } catch (err) {
        cleanup.push(err)
      }
      try {
        await listener
      } catch (err) {
        cleanup.push(err)
      }
    }
    try {
      await work
    } catch (err) {
      if (!failed || err !== primary) cleanup.push(err)
    }
    if (observer?.connected()) {
      try {
        await observer.closed
      } catch (err) {
        cleanup.push(err)
      }
    }
    try {
      await observer?.closeListener()
    } catch (err) {
      cleanup.push(err)
    }
    if (root) {
      try {
        await rm(root, { recursive: true, force: true })
      } catch (err) {
        cleanup.push(err)
      }
    }
  }
  if (fallbackUsed)
    cleanup.push(new Error('Owned fixture fallback was needed; timeout control is not qualified'))
  if (failed || cleanup.length) {
    const errors = [...(failed ? [primary] : []), ...cleanup]
    throw new AggregateError(errors, 'Native fixture deadline control failed', { cause: errors[0] })
  }
  process.stdout.write(`${JSON.stringify({ ...receipt, fallbackUsed: false, cleanupErrors: 0 })}\n`)
}

await main()
