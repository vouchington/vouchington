import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  coverageProducerPartition,
  coverageSuiteCatalog,
  coverageSuiteDescriptor,
} from './coverage-suites.mts'

describe('coverage suite catalog', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves every registry-owned dynamic shard descriptor without catalog enumeration', () => {
    expect(coverageSuiteCatalog().map(({ suite }) => suite)).not.toContain('web-shard-1')
    expect(coverageSuiteDescriptor('backend-shard-2').projects).toEqual([
      'backend/analytics-integration',
      'backend-data-stores',
      'backend-mocks',
      'backend-real-glide-mq',
    ])
    expect(coverageSuiteDescriptor('web-shard-3').projects).toEqual(['web'])
    expect(coverageSuiteDescriptor('web-api-shard-2').projects).toEqual(['web-api'])
    expect(coverageSuiteDescriptor('web-integration-shard-1').projects).toEqual(['web-integration'])
  })

  it('makes registry-owned shard partitions self-describing', () => {
    expect(coverageProducerPartition('web-shard-3', { CI_SHARD: '3/3' })).toEqual({
      group: 'web',
      index: 3,
      total: 3,
    })
    expect(coverageProducerPartition('backend-shard-5', { CI_SHARD: '5/5' })).toEqual({
      group: 'backend-unit',
      index: 5,
      total: 5,
    })
    expect(coverageProducerPartition('web-api-shard-2', { CI_SHARD: '2/2' })).toEqual({
      group: 'web-api',
      index: 2,
      total: 2,
    })
    expect(coverageProducerPartition('web-integration-shard-1')).toEqual({
      group: 'web-integration',
      index: 1,
      total: 1,
    })
  })

  it('gives every upstream provenance descriptor at least one project', () => {
    expect(coverageSuiteCatalog().every(({ projects }) => projects.length > 0)).toBe(true)
  })

  it('captures resolved Vitest coverage scope, include, exclude, and reporters', () => {
    const web = coverageSuiteDescriptor('web-shard-1').collector.settings
    expect(web).toMatchObject({
      all: false,
      provider: 'v8',
      reporters: ['text-summary', 'lcov', 'json-summary'],
      scope: 'web',
    })
    expect(web.include).toEqual(['web/**/*.{mts,ts,tsx}'])
    expect(web.exclude).toContain('integration-tests/**')
    expect(coverageSuiteDescriptor('tooling').collector.settings.include).toContain(
      'ci/**/*.{mts,ts,tsx}',
    )
    expect(coverageSuiteDescriptor('web-storybook').collector.settings.exclude).not.toContain(
      '**/*.{test,spec}.{mts,ts,tsx}',
    )
  })

  it('rejects a descriptor that is not a known suite or shard name', () => {
    expect(() => coverageSuiteDescriptor('not-a-suite')).toThrowError(
      'Unknown coverage suite: not-a-suite',
    )
  })

  it('describes promoted shards even when their registry default is lower', () => {
    expect(coverageSuiteDescriptor('backend-shard-5').suite).toBe('backend-shard-5')
    expect(coverageSuiteDescriptor('backend-shard-5').projects).toEqual(
      coverageSuiteDescriptor('backend-shard-1').projects,
    )
  })
})
