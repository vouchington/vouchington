import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

// Loaded via createRequire().resolve() + readFileSync — never a static
// `import` of the .woff files. A static import of a binary asset is
// special-cased by Vite/Vitest under the Node test environment (resolved as
// a URL string, not raw bytes), which would diverge from esbuild's production
// bundle behavior. This path is pure runtime Node code, untouched by any
// bundler's static analysis, so `@fontsource/inter` needs no esbuild
// `external` entry — it only needs to remain an ordinary dependency so
// `pnpm install` fetches it.
//
// Locally named `nodeRequire` (not `require`) so it can never alias the
// banner-injected global `require` shim esbuild.config.mts adds for other
// externalized CJS dependencies.
const nodeRequire = createRequire(import.meta.url)

export interface OgFont {
  name: 'Inter'
  data: Buffer
  weight: 400 | 600 | 700 | 800
  style: 'normal'
}

// Exported so scripts/copy-og-fonts.mts can copy exactly the weight files
// this module resolves at runtime — one list, not two kept in sync by hand.
export const FONT_WEIGHTS = [400, 600, 700, 800] as const

let cachedFonts: OgFont[] | undefined

// Changing OG render output (including bumping @fontsource/inter)? Bump
// OG_RENDERER_VERSION in web/lib/seo/og-image-url.ts (see #8046) so cached
// PNGs don't go stale.
export function loadInterFonts(): OgFont[] {
  if (cachedFonts) return cachedFonts

  cachedFonts = FONT_WEIGHTS.map(weight => ({
    name: 'Inter' as const,
    style: 'normal' as const,
    weight,
    data: readFileSync(
      nodeRequire.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`),
    ),
  }))

  return cachedFonts
}
