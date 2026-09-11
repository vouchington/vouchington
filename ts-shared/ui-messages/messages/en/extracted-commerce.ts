import part0 from './extracted-commerce/cardsManager.ts'
import part1 from './extracted-commerce/grants.ts'
import part2 from './extracted-commerce/landingPages.ts'
import part3 from './extracted-commerce/landingPagesManager.ts'
import part4 from './extracted-commerce/memberships.ts'
import part5 from './extracted-commerce/officialReferralLinks.ts'
import part6 from './extracted-commerce/pointValuationsManager.ts'
import part7 from './extracted-commerce/referralLinkValidations.ts'
import part8 from './extracted-commerce/referralLinks.ts'
import part9 from './extracted-commerce/referralLinksManager.ts'
import part10 from './extracted-commerce/rewardsProgramStatusesManager.ts'
import part11 from './extracted-commerce/spendingCategoriesManager.ts'

function merge(parts: Array<Record<string, unknown>>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const part of parts) mergeInto(output, part)
  return output
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      /* v8 ignore next -- generated chunks in this barrel use unique top-level namespaces */
      mergeInto(target[key], value)
    } else {
      target[key] = value
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default merge([
  part0,
  part1,
  part2,
  part3,
  part4,
  part5,
  part6,
  part7,
  part8,
  part9,
  part10,
  part11,
])
