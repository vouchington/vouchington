import { describe, expect, it } from 'vitest'
import {
  contributionLimitConfig,
  contributionLimitFieldMetadata,
  getContributionLimitFieldNames,
} from '../limits-config.mts'
import { validateContributionLimitConfig } from '../limit-validation.mts'

class TestValidationError extends Error {
  override name = 'TestValidationError'
}

describe('validateContributionLimitConfig', () => {
  const createValidationError = (message: string) => new TestValidationError(message)
  const validConfig = () => ({ ...contributionLimitConfig.defaultFields }) as Record<string, number>

  it('adds safety fields only for authored policy actions', () => {
    const fields = getContributionLimitFieldNames()
    expect(fields).toContain('authored_post_safety_daily_limit')
    expect(fields).toContain('community_just_joined_daily_limit')
    expect(fields).not.toContain('community_safety_daily_limit')
    expect(fields).not.toContain('article_free_daily_limit')
    expect(fields).not.toContain('blog_post_free_daily_limit')
  })

  it('reports authored policy limits with a positive staff-config minimum', () => {
    const metadata = contributionLimitFieldMetadata()
    expect(metadata.discussion_free_daily_limit?.min_value).toBe(1)
    expect(metadata.authored_post_safety_daily_limit?.min_value).toBe(1)
    expect(metadata.community_free_daily_limit?.min_value).toBe(-1)
  })

  it('accepts the shipped matrix', () => {
    expect(() =>
      validateContributionLimitConfig(validConfig(), createValidationError),
    ).not.toThrow()
  })

  it('rejects zero, unlimited, missing, and non-finite authored policy fields', () => {
    const config = validConfig()
    config.review_safety_daily_limit = 0
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Field review_safety_daily_limit must be a positive finite integer',
    )
    config.review_safety_daily_limit = -1
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Field review_safety_daily_limit must be a positive finite integer',
    )
    config.review_safety_daily_limit = Number.POSITIVE_INFINITY
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Field review_safety_daily_limit must be an integer greater than or equal to -1',
    )
    delete config.review_safety_daily_limit
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Field review_safety_daily_limit must be an integer greater than or equal to -1',
    )
  })

  it('rejects authored policy windows longer than one day', () => {
    const config = validConfig()
    config.review_safety_daily_window_seconds = 86_401
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Field review_safety_daily_window_seconds must not exceed 86400 seconds',
    )
  })

  it('rejects reversed plan capacity', () => {
    const config = validConfig()
    config.review_free_daily_limit = 3
    config.review_plus_daily_limit = 2
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Contribution limits must satisfy Free <= Plus <= Pro <= Safety for review daily',
    )
  })

  it('preserves legacy ordering checks for non-authored actions', () => {
    const config = validConfig()
    config.community_free_daily_limit = 6
    config.community_plus_daily_limit = 5
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Contribution limits must satisfy community_free_daily_limit <= community_plus_daily_limit <= community_pro_daily_limit',
    )

    config.community_free_daily_limit = 2
    config.community_plus_daily_limit = 5
    config.community_plus_daily_window_seconds = config.community_free_daily_window_seconds + 1
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Contribution windows must not increase from Free to Plus',
    )
  })

  it('requires each paid plan step to broaden every policy window', () => {
    const config = validConfig()
    config.review_plus_daily_limit = config.review_free_daily_limit
    config.review_plus_daily_window_seconds = config.review_free_daily_window_seconds
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Plus must strictly broaden Free capacity for review daily',
    )
  })

  it('accepts Pro equal to Safety and rejects reversed windows', () => {
    const config = validConfig()
    expect(() => validateContributionLimitConfig(config, createValidationError)).not.toThrow()
    config.review_safety_short_window_seconds = config.review_pro_short_window_seconds + 1
    expect(() => validateContributionLimitConfig(config, createValidationError)).toThrow(
      'Contribution windows must narrow from Free through Safety for review short',
    )
  })
})
