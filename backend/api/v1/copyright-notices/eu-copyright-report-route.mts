import type { Context } from '@jongleberry/api-server'
import { defineQueryContract, queryEnum, queryString } from '@modules/pagination'
import {
  currentUserCanReviewCopyrightNotices,
  readEuCopyrightTransparencyFigures,
} from '@services/copyright-notices'
import { assertCopyrightDsaTransparencyReportsEnabled } from '@services/copyright-notices/eu-reporting-gate'
import { renderEuCopyrightReportCsv } from '@services/copyright-notices/eu-reporting-csv'
import { assertReportingPeriod } from '@services/copyright-notices/territorial-fields'
import { assertNotSuspended } from '@services/users'
import { Readable } from 'node:stream'
import app from '../../app.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'

const formats = ['json', 'csv_notices', 'csv_complaints'] as const
const reportQuery = defineQueryContract({
  period_start: queryString({ description: 'Inclusive UTC reporting-period start.' }),
  period_end: queryString({ description: 'Exclusive UTC reporting-period end.' }),
  format: queryEnum(formats, {
    default: 'json',
    description: 'JSON or a Commission CSV template.',
  }),
})

app.route('/api/v1/copyright-eu-reports').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-eu-reports', reportQuery)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-eu-reports',
  )
  assertNotSuspended(currentUser)
  await assertCopyrightDsaTransparencyReportsEnabled()
  const { period_start: rawStart, period_end: rawEnd, format: rawFormat } = ctx.query
  ctx.assert(typeof rawStart === 'string', 422, 'period_start is required')
  ctx.assert(typeof rawEnd === 'string', 422, 'period_end is required')
  const format = rawFormat === undefined ? 'json' : rawFormat
  ctx.assert(formats.includes(format as (typeof formats)[number]), 422, 'format is invalid')
  validateRequestContract(ctx, 'GET:/api/v1/copyright-eu-reports', {
    query: { period_start: rawStart, period_end: rawEnd, format },
  })
  const start = new Date(rawStart)
  const end = new Date(rawEnd)
  assertReportingPeriod(start, end)
  if (format !== 'json') {
    ctx.assert(
      start.toISOString().endsWith('T00:00:00.000Z') &&
        end.toISOString().endsWith('T00:00:00.000Z'),
      422,
      'CSV periods must begin and end at UTC midnight',
    )
  }
  const report = await readEuCopyrightTransparencyFigures(currentUser, start, end)
  if (format === 'json') {
    ctx.json(apiResponse('GET:/api/v1/copyright-eu-reports', { copyright_eu_report: report }))
    return
  }
  const csvFormat = format === 'csv_notices' || format === 'csv_complaints' ? format : null
  ctx.assert(csvFormat, 422, 'format is invalid')
  ctx.set('Content-Type', 'text/csv; charset=utf-8')
  ctx.set('Content-Disposition', `attachment; filename="copyright-${format}.csv"`)
  await ctx.pipeline(Readable.from([renderEuCopyrightReportCsv(report, csvFormat)]))
})
