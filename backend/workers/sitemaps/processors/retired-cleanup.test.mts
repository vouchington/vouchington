import { randomUUID } from 'node:crypto'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { readAllQueueJobs, overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers'
import { sitemapsQueue } from '@queues/sitemaps/queues'
import { processRetiredSitemapCleanup } from './retired-cleanup.mts'
import { sitemapsWorkConfig } from '@services/sitemaps/work-limits'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { RetiredSitemapGeneration } from '@services/sitemaps/generation-storage'

describe('sitemap cleanup continuation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('drains record and child-page caps through real cleanup continuation jobs', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(sitemapsWorkConfig, {
        retired_generation_delete_page_size: 1,
        retired_generation_record_scan_limit: 1,
      }),
    )
    const generations = [randomUUID(), randomUUID()].toSorted()
    const objects = new Map<string, string>(
      generations.map(generation => [
        `sitemaps/retired/records/${generation}.json`,
        JSON.stringify({
          generation_id: generation,
          page_prefix: `families/users/${generation}/`,
          page_count: 1,
          next_page: 1,
          retire_after: '2026-01-01T00:00:00.000Z',
        } satisfies RetiredSitemapGeneration),
      ]),
    )
    const deleted: string[] = []
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async command => {
      if (command instanceof GetObjectCommand) {
        const body = objects.get(command.input.Key!)
        if (body === undefined)
          throw Object.assign(new Error('missing object'), { name: 'NoSuchKey' })
        return { Body: { transformToString: async () => body } } as never
      }
      if (command instanceof ListObjectsV2Command) {
        const keys = [...objects.keys()]
          .filter(
            key =>
              key.startsWith(command.input.Prefix!) &&
              (!command.input.StartAfter || key > command.input.StartAfter),
          )
          .toSorted()
        return {
          Contents: keys.slice(0, command.input.MaxKeys).map(Key => ({ Key })),
          IsTruncated: keys.length > command.input.MaxKeys!,
        } as never
      }
      if (command instanceof PutObjectCommand) {
        objects.set(command.input.Key!, command.input.Body as string)
        return {} as never
      }
      if (command instanceof DeleteObjectsCommand) {
        deleted.push(...command.input.Delete!.Objects!.map(object => object.Key!))
        return {} as never
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(command.input.Key!)
        return {} as never
      }
      throw new Error(`Unexpected S3 command ${command.constructor.name}`)
    })
    const beforeIds = new Set((await readAllQueueJobs(sitemapsQueue)).map(job => job.id))
    await processRetiredSitemapCleanup(undefined, new Date('2026-10-25T00:00:00.000Z'))
    const continuations = (await readAllQueueJobs(sitemapsQueue)).filter(
      job => !beforeIds.has(job.id) && job.name === 'sitemaps.processRetiredSitemapCleanup',
    )
    expect(continuations).toHaveLength(1)
    expect(continuations[0]!.opts.ordering).toEqual({ key: 'sitemaps:dispatcher', concurrency: 1 })
    expect(deleted).toHaveLength(1)
    expect(JSON.parse(objects.get('sitemaps/retired/_cursor.json')!)).toEqual({
      after_key: `sitemaps/retired/records/${generations[0]}.json`,
    })
    await processRetiredSitemapCleanup(undefined, new Date('2026-10-25T00:00:00.000Z'))
    expect(deleted).toEqual(generations.map(generation => `families/users/${generation}/1.xml`))
    expect(JSON.parse(objects.get('sitemaps/retired/_cursor.json')!)).toEqual({ after_key: null })
    const final = (await readAllQueueJobs(sitemapsQueue)).filter(
      job => !beforeIds.has(job.id) && job.name === 'sitemaps.processRetiredSitemapCleanup',
    )
    expect(final.map(job => job.id)).toEqual(continuations.map(job => job.id))
  })
})
