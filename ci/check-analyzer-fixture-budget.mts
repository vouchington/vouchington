import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { observeFixtureExit } from './bounded-exit-observer.mts'
import { createAnalyzerFixtureBudget } from './analyzer-fixture-budget.mts'

// Deliberately holds NoMist's machine-wide lock: run once before other analyzers, not in Vitest.
async function main(): Promise<void> {
  for (const invalid of [0, 4_001, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    assert.throws(() => createAnalyzerFixtureBudget(invalid), RangeError)
  }
  const admissionBudget = createAnalyzerFixtureBudget()
  const cli = resolve('node_modules/no-mistakes/bin/no-mistakes.js')
  const unownedRoot = resolve('.')
  assert.throws(() => admissionBudget.check(cli, unownedRoot), /not owned/)
  assert.throws(() => admissionBudget.check(cli, '\0'), /not owned/)
  assert.throws(() => admissionBudget.check('/missing/analyzer-cli.js', unownedRoot), /not owned/)
  assert.throws(() => admissionBudget.git(['-C', unownedRoot, 'status']), /not owned/)
  assert.throws(() => admissionBudget.git(['-C', '\0', 'status']), /not owned/)
  assert.throws(() => admissionBudget.git(['init', '-q', unownedRoot]), /not owned/)
  assert.equal(admissionBudget.actors.length, 0)
  // Let the deliberately hung holder expire before the normal contender's deadline.
  const budget = createAnalyzerFixtureBudget(2_000)
  let root: string | undefined
  let observer: ReturnType<typeof observeFixtureExit> | undefined
  let work: ReturnType<typeof budget.check> | undefined
  let contenderRoot: string | undefined
  let contender: ReturnType<typeof budget.check> | undefined
  let settled = false
  let fallbackUsed = false
  let failed = false
  let primary: unknown
  const cleanup: unknown[] = []
  let receipt: object | undefined
  try {
    root = await budget.createRoot('analyzer-budget-')
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
    const contenderBudget = createAnalyzerFixtureBudget()
    contenderRoot = await contenderBudget.createRoot('analyzer-budget-contender-')
    assert.throws(() => contenderBudget.check(cli, root!), /not owned/)
    assert.equal(contenderBudget.actors.length, 0)
    assert.equal(contenderBudget.git(['init', '-q', contenderRoot]).status, 0)
    await writeFile(join(contenderRoot, '.no-mistakes.yml'), 'rules: []\n')
    assert.equal(contenderBudget.git(['-C', contenderRoot, 'add', '.']).status, 0)
    work = budget.check(cli, root)
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
    contender = contenderBudget.check(cli, contenderRoot)
    const [result, contenderResult] = await Promise.all([work, contender])
    assert.equal(result.status, 124, result.stderr)
    assert.equal(contenderResult.status, 0, contenderResult.stderr)
    assert.deepEqual(JSON.parse(contenderResult.stdout).rules, [])
    assert.match(contenderResult.stderr, /waiting for lock held by/)
    assert.equal(contenderBudget.actors[0]?.closed, true)
    await observer.closed
    assert.equal(observer.error(), undefined)
    assert.equal(budget.actors.length, 1)
    assert.equal(budget.actors[0]?.closed, true)
    receipt = {
      nativeExit: result.status,
      contenderExit: contenderResult.status,
      contenderWrapper: contenderBudget.actors[0],
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
    try {
      await contender
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
    for (const directory of [root, contenderRoot]) {
      if (!directory) continue
      try {
        await rm(directory, { recursive: true, force: true })
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
