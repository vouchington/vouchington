import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished, vi } from 'vitest'

import type { RegistryFetch } from './image-registry.mts'
import { runImagePromotionCli } from './image-promotion-cli.mts'
import { startPromotionRegistry } from './image-promotion-test-fixtures.mts'

const sourceSha = 'a'.repeat(40)
const environment = {
  GHCR_PASSWORD: 'registry-secret',
  GHCR_USERNAME: 'registry-user',
  MAIN_REACHABLE_SOURCE_SHA: sourceSha,
}

describe('image promotion CLI', () => {
  it('reads credentials and the workflow-proven main ancestor from env, then prints JSON', async () => {
    const output: string[] = []
    const directory = await mkdtemp(join(tmpdir(), 'image-promotion-cli-'))
    onTestFinished(() => rm(directory, { force: true, recursive: true }))
    const { fetch } = await startPromotionRegistry({ web: 'missing' }, join(directory, 'events'))
    await expect(
      runImagePromotionCli(['plan', 'web'], environment, value => output.push(value), {
        registry: { fetch },
        workspaceRoot: '/not-used-for-web',
      }),
    ).resolves.toEqual({
      missingTargets: ['web'],
      selectedTargets: ['web'],
      verifiedImages: [],
    })
    expect(output).toEqual([
      `${JSON.stringify({ missingTargets: ['web'], selectedTargets: ['web'], verifiedImages: [] })}\n`,
    ])
  })

  it('rejects extra argv and absent or invalid environment input before transport', async () => {
    const fetch = vi.fn<RegistryFetch>()
    for (const argv of [[], ['plan'], ['plan', 'web', 'registry-secret'], ['publish', 'web']])
      await expect(
        runImagePromotionCli(argv, environment, () => undefined, { registry: { fetch } }),
      ).rejects.toThrow('Usage:')
    for (const name of Object.keys(environment)) {
      await expect(
        runImagePromotionCli(['plan', 'web'], { ...environment, [name]: '' }, () => undefined, {
          registry: { fetch },
        }),
      ).rejects.toThrow(`${name} is required`)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not expose credentials from a transport failure', async () => {
    const failure: unknown = await runImagePromotionCli(
      ['plan', 'web'],
      environment,
      () => undefined,
      {
        registry: {
          fetch: async () => {
            throw new Error('registry-secret')
          },
        },
        workspaceRoot: '/not-used-for-web',
      },
    ).catch((error: unknown) => error)
    expect(failure).toEqual(new Error('GHCR manifest resolution failed'))
    expect(String(failure)).not.toContain('registry-secret')
  })

  it.each([
    {
      argv: ['plan', 'web', 'registry-secret'],
      environment,
      message: 'Usage:',
    },
    {
      argv: ['plan', 'web'],
      environment: { ...environment, GHCR_PASSWORD: '' },
      message: 'GHCR_PASSWORD is required',
    },
  ])(
    'exits one with sanitized stderr for invalid entrypoint input',
    ({ argv, environment, message }) => {
      const result = spawnSync(
        process.execPath,
        ['--experimental-strip-types', 'ci/image-promotion-cli.mts', ...argv],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { ...process.env, ...environment },
          maxBuffer: 64 * 1024,
          timeout: 5000,
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain(message)
      expect(result.stderr).not.toContain('registry-secret')
    },
  )
})
