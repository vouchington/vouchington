import satori from 'satori'
import sharp from 'sharp'
import type { EnvironmentConfig } from '../config.mts'
import type { createS3Client, fetchImageFromS3 } from '../s3/index.mts'
import type { OgParams } from './params.mts'
import { loadInterFonts } from './fonts.mts'
import { resolveAvatarDataUri } from './avatar.mts'
import { buildGenericCardNode } from './generic-card.mts'
import { buildLandingCardNode } from './landing-card.mts'
import { CARD_WIDTH, CARD_HEIGHT } from './card-frame.mts'

export interface OgRenderDependencies {
  createS3Client: typeof createS3Client
  fetchImageFromS3: typeof fetchImageFromS3
}

// OG cards render fresh on every invocation instead of going through
// processImageRequest's S3 render-cache (fixed 1200x630 PNG, no
// width/format negotiation to key on) — CloudFront's own edge cache handles
// repeat-request efficiency, keyed on the content-addressed /og/<base64url>
// path.
//
// Changing OG render output (satori/sharp config, card layout)? Bump
// OG_RENDERER_VERSION in web/lib/seo/og-image-url.ts (see #8046) so cached
// PNGs don't go stale.
export async function renderOgImage(
  params: OgParams,
  config: EnvironmentConfig,
  dependencies: OgRenderDependencies,
): Promise<Buffer> {
  const fonts = loadInterFonts()

  const avatarDataUri =
    params.type === 'landing' && params.avatarImageId
      ? await resolveAvatarDataUri(params.avatarImageId, config, dependencies)
      : undefined

  const node =
    params.type === 'generic'
      ? buildGenericCardNode(params)
      : buildLandingCardNode(params, avatarDataUri)

  // satori's public .d.ts types its `element` param as React's `ReactNode`
  // even though its object-literal API (used here, not JSX) accepts plain
  // `{ type, props }` nodes at runtime. `@types/react` is a devDependency
  // purely so this type resolves; no `react` runtime package is installed
  // or required. The cast bridges satori's JSX-oriented types to our own
  // `SatoriNode` shape, which isn't structurally a `ReactNode` (no `key`).
  const svg = await satori(node as unknown as Parameters<typeof satori>[0], {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
  })

  return sharp(Buffer.from(svg)).png().toBuffer()
}
