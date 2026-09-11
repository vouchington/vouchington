import type { OgGenericParams } from './params.mts'
import { cardFrame } from './card-frame.mts'
import type { SatoriNode } from './node.mts'

// Changing OG render output? Bump OG_RENDERER_VERSION in
// web/lib/seo/og-image-url.ts (see #8046) so cached PNGs don't go stale.
export function buildGenericCardNode(params: OgGenericParams): SatoriNode {
  const eyebrow: SatoriNode = {
    type: 'div',
    props: {
      style: {
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        opacity: 0.85,
      },
      children: params.eyebrow,
    },
  }

  const middleBlock: SatoriNode = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', gap: '24px' },
      children: [
        {
          type: 'div',
          props: {
            style: { fontSize: 84, fontWeight: 800, lineHeight: 1.1 },
            children: params.title,
          },
        },
        {
          type: 'div',
          props: {
            style: { fontSize: 34, lineHeight: 1.3, maxWidth: '900px', opacity: 0.95 },
            children: params.description,
          },
        },
      ],
    },
  }

  const footer: SatoriNode = {
    type: 'div',
    props: {
      style: { fontSize: 24, opacity: 0.8 },
      children: params.domainLabel,
    },
  }

  return cardFrame([eyebrow, middleBlock, footer])
}
