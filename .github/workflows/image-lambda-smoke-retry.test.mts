import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runImageLambdaSmoke } from '../test-helpers/image-lambda-smoke-fixture.mts'

const smokeScriptSource = readFileSync(
  resolve('lambdas/image-resize/scripts/tests/smoke-test-image-lambda.sh'),
  'utf8',
)

describe('Image lambda smoke port collision recovery', () => {
  it('retries once on an exact bind collision, then succeeds', async () => {
    const run = await runImageLambdaSmoke(
      'Error: listen EADDRINUSE: address already in use :::41001',
    )

    expect(run.result.code).toBe(0)
    expect(run.result.killed).toBe(false)
    expect(run.result.signal).toBeNull()
    expect(run.trace).toContain('signal SIGINT')
    expect(run.events).toEqual(['allocate', 'launch', 'allocate', 'launch'])
    expect(run.allocations.trim()).toBe('2')
  })

  it('fails immediately without reallocating after an unrelated startup error', async () => {
    const run = await runImageLambdaSmoke("Error: Cannot find module 'image-resize/index.mts'")

    expect(run.result.code).toBe(1)
    expect(run.result.killed).toBe(false)
    expect(run.result.signal).toBeNull()
    expect(run.events).toEqual(['allocate', 'launch'])
    expect(run.allocations.trim()).toBe('1')
  })

  it('does not accept the startup banner as readiness (regression for defect 1)', async () => {
    const run = await runImageLambdaSmoke()

    expect(run.result.stdout).toContain(
      'GET /health returned HTTP 000 (expected 200) within 20 seconds.',
    )
    expect(run.result.stdout).toContain('Lambda dev server: http://localhost:41001')
    expect(run.trace.filter(event => event === 'probe')).toHaveLength(40)
    expect(run.trace.filter(event => event === 'step')).toHaveLength(40)
    expect(run.trace).toContain('signal SIGTERM')

    expect(run.result.code).toBe(1)
    expect(run.result.killed).toBe(false)
    expect(run.result.signal).toBeNull()
    expect(run.events).toEqual(['allocate', 'launch'])
    expect(run.allocations.trim()).toBe('1')
  })
})

describe('Image lambda smoke test hardening', () => {
  it('uses HTTP readiness with an allocated port and a cleanup trap', () => {
    expect(smokeScriptSource).toContain('ci/allocate-browser-safe-ports.py 1')
    expect(smokeScriptSource).toContain('trap cleanup EXIT INT TERM')
    expect(smokeScriptSource).toContain('http://127.0.0.1:${IMAGE_LAMBDA_PORT}/health')
    expect(smokeScriptSource).toContain('S3_BUCKET_IMAGES=test-images')
    expect(smokeScriptSource).toContain('S3_BUCKET_RENDERS=test-renders')
    expect(smokeScriptSource).not.toContain('grep -q "Lambda dev server:"')
  })
})
