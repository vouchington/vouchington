import type { SatoriNode } from './node.mts'

// Changing OG render output? Bump OG_RENDERER_VERSION in
// web/lib/seo/og-image-url.ts (see #8046) so cached PNGs don't go stale.
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

const CARD_GRADIENT =
  'linear-gradient(135deg, rgb(10,25,47) 0%, rgb(16,62,106) 50%, rgb(215,166,82) 100%)'

// Shared 1200x630 frame both card types render into: gradient background,
// white text, 64px padding, flex column with content pinned top/bottom via
// justifyContent: space-between.
export function cardFrame(children: SatoriNode[]): SatoriNode {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        padding: '64px',
        backgroundImage: CARD_GRADIENT,
        color: '#ffffff',
        fontFamily: 'Inter',
      },
      children,
    },
  }
}
