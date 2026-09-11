import { createUtmParser } from '@vouchington/utils/utm'

const SHORTCODE_MAP: Record<string, string> = {
  ig: 'instagram',
  tw: 'twitter',
  x: 'twitter',
  fb: 'facebook',
  li: 'linkedin',
  yt: 'youtube',
  tt: 'tiktok',
  rd: 'reddit',
}

const { resolveSource: resolveUtmSource, extractFromUrl: extractUtmParams } = createUtmParser({
  sourceAliases: SHORTCODE_MAP,
  fallbackSourceParam: 'ref',
})

export { extractUtmParams, resolveUtmSource }
