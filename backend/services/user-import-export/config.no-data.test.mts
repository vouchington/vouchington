import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

vi.resetModules()

const captureException = sentryCaptureExceptionMock

const { getUserImportExportConfig, userImportExportConfig } = await import('./config.mts')

const clearFields = () =>
  deleteDynamicConfigFieldsForTest(
    userImportExportConfig,
    Object.keys(userImportExportConfig.fieldTypes),
  )

const DEFAULTS = {
  sync_export_max_items: 1_000,
  import_max_body_bytes: 2 * 1024 * 1024,
  import_dispatch_page_size: 100,
  import_recovery_batch_size: 100,
  import_status_page_size: 100,
  rss_feed_import_budget_ms: 15_000,
  export_cursor_batch_size: 1_000,
  topic_import_attempt_prune_batch_size: 100,
}

describe('getUserImportExportConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearFields()
  })

  it('returns defaults when no fields are set', () => {
    expect(getUserImportExportConfig()).toEqual(DEFAULTS)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('applies a valid sync export max override', () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 250 })

    expect(getUserImportExportConfig()).toEqual({
      ...DEFAULTS,
      sync_export_max_items: 250,
    })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('applies valid import limit overrides', () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, {
      import_max_body_bytes: 4_096,
      import_dispatch_page_size: 3,
      rss_feed_import_budget_ms: 2_000,
    })

    expect(getUserImportExportConfig()).toEqual({
      ...DEFAULTS,
      import_max_body_bytes: 4_096,
      import_dispatch_page_size: 3,
      rss_feed_import_budget_ms: 2_000,
    })
  })

  it('keeps the default and reports an import budget above the worker lock', () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, {
      rss_feed_import_budget_ms: 60_000,
    })

    expect(getUserImportExportConfig()).toEqual(DEFAULTS)
    expect(captureException).toHaveBeenCalledOnce()
  })

  it('keeps the default and reports invalid sync export max values', () => {
    overrideDynamicConfigFieldsForTest(userImportExportConfig, { sync_export_max_items: 0 })

    expect(getUserImportExportConfig()).toEqual(DEFAULTS)
    expect(captureException).toHaveBeenCalledOnce()
  })
})
