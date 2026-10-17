import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureExceptionMock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

vi.resetModules()

const captureException = sentryCaptureExceptionMock

const { DEFAULT_USER_IMPORT_EXPORT_CONFIG, getUserImportExportConfig, userImportExportConfig } =
  await import('./config.mts')

describe('getUserImportExportConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteDynamicConfigFieldsForTest(
      userImportExportConfig,
      Object.keys(userImportExportConfig.fieldTypes),
    )
  })

  it('returns defaults when no fields are set', () => {
    expect(getUserImportExportConfig()).toEqual(DEFAULT_USER_IMPORT_EXPORT_CONFIG)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('applies a valid sync export max override', () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 250 })

    expect(getUserImportExportConfig()).toEqual({
      ...DEFAULT_USER_IMPORT_EXPORT_CONFIG,
      sync_export_max_items: 250,
    })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('applies valid import limit overrides', () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, {
      import_max_body_bytes: 4_096,
      import_dispatch_page_size: 3,
      import_insert_chunk_size: 7,
      rss_feed_import_budget_ms: 2_000,
    })

    expect(getUserImportExportConfig()).toEqual({
      ...DEFAULT_USER_IMPORT_EXPORT_CONFIG,
      import_max_body_bytes: 4_096,
      import_dispatch_page_size: 3,
      import_insert_chunk_size: 7,
      rss_feed_import_budget_ms: 2_000,
    })
  })

  it('keeps the default and reports an import budget above the worker lock', () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, {
      rss_feed_import_budget_ms: 60_000,
    })

    expect(getUserImportExportConfig()).toEqual(DEFAULT_USER_IMPORT_EXPORT_CONFIG)
    expect(captureException).toHaveBeenCalledOnce()
  })

  it('keeps the default and reports invalid sync export max values', () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 0 })

    expect(getUserImportExportConfig()).toEqual(DEFAULT_USER_IMPORT_EXPORT_CONFIG)
    expect(captureException).toHaveBeenCalledOnce()
  })
})
