import type { Env } from './types.mts'

const SITE_ORIGIN_FALLBACK = 'https://voucha.ai'

export function getSiteOrigin(env: Env): string {
  return (env.SITE_ORIGIN ?? SITE_ORIGIN_FALLBACK).replace(/\/+$/, '')
}
