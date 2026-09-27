import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  applyRetentionPlan,
  buildRetentionPlan,
  RetentionDeletionError,
  type RetentionPlan,
} from './image-retention.mts'
import { retentionBoundary, testImage, type TestImage } from './image-retention-test-fixtures.mts'
import { mainRepository } from './image-retention-git-test-fixture.mts'
import { queueVerifier } from './image-retention-provenance-test-fixture.mts'

const credentials = { password: 'registry-secret', username: 'registry-user' }
const githubToken = 'github-secret'
const nowMs = Date.parse('2026-09-27T12:00:00Z')
const day = 24 * 60 * 60 * 1000
const iso = (timestamp: number) => new Date(timestamp).toISOString()

describe('image retention planning', () => {
  it('keeps the newest 30 reachable versions globally and deletes only old proven queue images', async () => {
    const repository = await mainRepository(31)
    const mainImages = repository.shas.map((sha, index) =>
      testImage(1000 + index, 'api', sha, iso(nowMs - (40 - index) * day)),
    )
    const untagged = Array.from({ length: 70 }, (_, index) =>
      testImage(2000 + index, 'api', 'a'.repeat(40), iso(nowMs - 20 * day), { tags: [] }),
    )
    const oldQueue = testImage(3000, 'api', 'b'.repeat(40), iso(nowMs - 8 * day))
    const boundaryQueue = testImage(3001, 'api', 'c'.repeat(40), iso(nowMs - 8 * day), {
      updatedAt: iso(nowMs - 7 * day),
    })
    const artifact = testImage(3002, 'api', 'd'.repeat(40), iso(nowMs - 20 * day), {
      protected: true,
    })
    const createdBoundary = testImage(3003, 'api', 'e'.repeat(40), iso(nowMs - 7 * day))
    const mixedTags = testImage(3004, 'api', 'f'.repeat(40), iso(nowMs - 20 * day), {
      tags: [`sha-${'f'.repeat(40)}`, 'latest'],
    })
    const multipleTags = testImage(3005, 'api', '1'.repeat(40), iso(nowMs - 20 * day), {
      tags: [`sha-${'1'.repeat(40)}`, `sha-${'2'.repeat(40)}`],
    })
    const attestationTag = testImage(3006, 'api', '3'.repeat(40), iso(nowMs - 20 * day), {
      tags: [`sha256:${'3'.repeat(64)}`],
    })
    const images = [
      ...mainImages.slice(1).toReversed(),
      ...untagged,
      mainImages[0]!,
      oldQueue,
      boundaryQueue,
      artifact,
      createdBoundary,
      mixedTags,
      multipleTags,
      attestationTag,
      testImage(4000, 'worker-cpu', repository.tip, iso(nowMs - day)),
      testImage(5000, 'web', repository.tip, iso(nowMs - day)),
    ]
    const boundary = await retentionBoundary(images, ['api', 'worker-cpu', 'web'], repository.tip)

    const plan = await buildRetentionPlan(
      { credentials, githubToken },
      {
        git: { cwd: repository.directory },
        github: boundary.github,
        nowMs,
        provenance: { ghExecutable: await queueVerifier() },
        registry: boundary.registry,
        workspaceRoot: repository.directory,
      },
    )

    expect(plan.deletions.map(({ id }) => id)).toEqual([1000, 3000])
    expect(plan.retainedCount).toBe(108)
    expect(plan.invisibleOptionalTargets).toEqual(['worker-io'])
    expect(plan.visibleTargets).toEqual(['api', 'worker-cpu', 'web'])
    expect(boundary.deleteRequests).toEqual([])

    await expect(
      applyRetentionPlan({ credentials, githubToken }, plan, {
        git: { cwd: repository.directory },
        github: boundary.github,
        registry: boundary.registry,
      }),
    ).resolves.toMatchObject({ deleted: [{ id: 1000 }, { id: 3000 }] })
    expect(boundary.deleteRequests).toEqual([1000, 3000])
  })

  it('aborts on missing required visibility and verifier failures but protects artifacts', async () => {
    const repository = await mainRepository(1)
    const missing = await retentionBoundary([], ['api', 'worker-cpu'], repository.tip)
    await expect(
      buildRetentionPlan(
        { credentials, githubToken },
        {
          git: { cwd: repository.directory },
          github: missing.github,
          registry: missing.registry,
          workspaceRoot: repository.directory,
        },
      ),
    ).rejects.toThrow('required GHCR packages are not visible: web')

    const oldQueue = testImage(1, 'api', 'e'.repeat(40), iso(nowMs - 8 * day))
    const artifact = testImage(2, 'api', 'f'.repeat(40), iso(nowMs - 8 * day), {
      protected: true,
    })
    const boundary = await retentionBoundary(
      [oldQueue, artifact],
      ['api', 'worker-cpu', 'web'],
      repository.tip,
    )
    await expect(
      buildRetentionPlan(
        { credentials, githubToken },
        {
          git: { cwd: repository.directory },
          github: boundary.github,
          nowMs,
          provenance: { ghExecutable: await queueVerifier(true) },
          registry: boundary.registry,
          workspaceRoot: repository.directory,
        },
      ),
    ).rejects.toThrow('image provenance verification process failed')
    expect(boundary.deleteRequests).toEqual([])

    const artifactOnly = await retentionBoundary(
      [artifact],
      ['api', 'worker-cpu', 'web'],
      repository.tip,
    )
    await expect(
      buildRetentionPlan(
        { credentials, githubToken },
        {
          git: { cwd: repository.directory },
          github: artifactOnly.github,
          nowMs,
          provenance: { ghExecutable: await queueVerifier(true) },
          registry: artifactOnly.registry,
          workspaceRoot: repository.directory,
        },
      ),
    ).resolves.toMatchObject({ deletions: [], retainedCount: 1 })
  })

  it('requires worker-io visibility only while its authoritative flag enables the target', async () => {
    const repository = await mainRepository(1)
    await writeFile(
      join(repository.directory, '.github/worker-io-automation.env'),
      'WORKER_IO_AUTOMATION_ENABLED=true\n',
    )
    const boundary = await retentionBoundary([], ['api', 'worker-cpu', 'web'], repository.tip)
    await expect(
      buildRetentionPlan(
        { credentials, githubToken },
        {
          git: { cwd: repository.directory },
          github: boundary.github,
          registry: boundary.registry,
          workspaceRoot: repository.directory,
        },
      ),
    ).rejects.toThrow('required GHCR packages are not visible: worker-io')
  })

  it('classifies a visible inactive worker-io package without claiming it is required', async () => {
    const repository = await mainRepository(1)
    const images = (['api', 'worker-cpu', 'worker-io', 'web'] as const).map((target, index) =>
      testImage(10 + index, target, repository.tip, iso(nowMs - day)),
    )
    const boundary = await retentionBoundary(
      images,
      ['api', 'worker-cpu', 'worker-io', 'web'],
      repository.tip,
    )
    await expect(
      buildRetentionPlan(
        { credentials, githubToken },
        {
          git: { cwd: repository.directory },
          github: boundary.github,
          nowMs,
          registry: boundary.registry,
          workspaceRoot: repository.directory,
        },
      ),
    ).resolves.toMatchObject({
      invisibleOptionalTargets: [],
      retainedCount: 4,
      visibleTargets: ['api', 'worker-cpu', 'worker-io', 'web'],
    })
  })
})

function deletionPlan(images: TestImage[], mainTip: string): RetentionPlan {
  return {
    deletions: images.map(image => ({
      ...image.version,
      sourceSha: image.version.tags[0]!.slice(4),
      tags: [...image.version.tags],
      target: image.target,
    })),
    invisibleOptionalTargets: [],
    mainTip,
    retainedCount: 0,
    visibleTargets: ['api'],
  }
}

describe('image retention application', () => {
  it('revalidates every binding and the fresh remote main tip before the first delete', async () => {
    const repository = await mainRepository(1)
    const images = [testImage(1, 'api', repository.tip, iso(nowMs - 40 * day))]
    const boundary = await retentionBoundary(images, ['api', 'worker-cpu', 'web'], repository.tip)
    boundary.setRemoteMainTip('f'.repeat(40))

    await expect(
      applyRetentionPlan({ credentials, githubToken }, deletionPlan(images, repository.tip), {
        git: { cwd: repository.directory },
        github: boundary.github,
        registry: boundary.registry,
      }),
    ).rejects.toThrow('remote main changed before deletion')
    expect(boundary.deleteRequests).toEqual([])
  })

  it('stops after an indeterminate delete and separates every outcome class', async () => {
    const repository = await mainRepository(3)
    const images = [1, 2, 3].map((id, index) =>
      testImage(id, 'api', repository.shas[index]!, iso(nowMs - (40 + id) * day)),
    )
    const boundary = await retentionBoundary(images, ['api', 'worker-cpu', 'web'], repository.tip, {
      1: 'success',
      2: 'reset',
    })
    const failure: unknown = await applyRetentionPlan(
      { credentials, githubToken },
      deletionPlan(images, repository.tip),
      {
        git: { cwd: repository.directory },
        github: boundary.github,
        registry: boundary.registry,
      },
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RetentionDeletionError)
    expect((failure as RetentionDeletionError).deleted.map(({ id }) => id)).toEqual([1])
    expect((failure as RetentionDeletionError).indeterminate?.id).toBe(2)
    expect((failure as RetentionDeletionError).neverAttempted.map(({ id }) => id)).toEqual([3])
    expect(boundary.deleteRequests).toEqual([1, 2])
  })

  it('finishes every metadata check before deleting when a later package drifts', async () => {
    const repository = await mainRepository(2)
    const images = [
      testImage(1, 'api', repository.shas[0]!, iso(nowMs - 40 * day)),
      testImage(2, 'web', repository.shas[1]!, iso(nowMs - 40 * day)),
    ]
    const boundary = await retentionBoundary(images, ['api', 'worker-cpu', 'web'], repository.tip)
    const plan = deletionPlan(images, repository.tip)
    images[1]!.version.tags = ['changed']

    await expect(
      applyRetentionPlan({ credentials, githubToken }, plan, {
        git: { cwd: repository.directory },
        github: boundary.github,
        registry: boundary.registry,
      }),
    ).rejects.toThrow('package version changed before deletion')
    expect(boundary.deleteRequests).toEqual([])
  })
})
