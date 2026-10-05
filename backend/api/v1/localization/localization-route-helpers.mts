import type { Context } from '@jongleberry/api-server'
import {
  defineQueryContract,
  queryCsvArray,
  queryString,
  requiredQueryEnum,
} from '@modules/pagination'
import { PUBLIC_LOCALIZATION_CONSUMERS } from '@vouchington/localization'
import { validateRequestContract } from '../../response-helpers.mts'
import { queryValues } from '@services/localization/query'
import {
  headerValue,
  assertPublicLocalizationConsumer,
  isLocalizationClientError,
  localizationGetResult,
} from '@services/localization'

export const localizationQuery = defineQueryContract({
  consumer: requiredQueryEnum(PUBLIC_LOCALIZATION_CONSUMERS),
  locales: queryCsvArray(queryString()),
  selectors: queryCsvArray(queryString()),
})

export function createLocalizationRoute(getResult: typeof localizationGetResult) {
  return function localizationRoute(ctx: Context): void {
    try {
      const consumer = ctx.query.consumer
      if (typeof consumer !== 'string' || consumer.length === 0)
        throw new TypeError('consumer is required')
      assertPublicLocalizationConsumer(consumer)
      validateRequestContract(ctx, 'GET:/api/v1/localization', {
        query: {
          consumer,
          locales: queryValues(ctx.query.locales),
          selectors: queryValues(ctx.query.selectors),
        },
      })
      const result = getResult(
        ctx.query as Record<string, unknown>,
        headerValue(ctx.req.headers['if-none-match']),
      )
      ctx.set('ETag', result.etag)
      ctx.set('Cache-Control', `public, max-age=${result.ttlSeconds}`)
      if (result.status === 304 || result.body === undefined) {
        ctx.setStatus(304)
        return
      }
      ctx.json(JSON.parse(result.body) as Record<string, unknown>)
    } catch (err) {
      if (isLocalizationClientError(err)) ctx.throw(400, err.message)
      throw err
    }
  }
}

export const localizationRoute = createLocalizationRoute(localizationGetResult)
