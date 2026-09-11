import type { OgLandingParams } from './params.mts'
import { cardFrame } from './card-frame.mts'
import type { SatoriNode } from './node.mts'

// Changing OG render output? Bump OG_RENDERER_VERSION in
// web/lib/seo/og-image-url.ts (see #8046) so cached PNGs don't go stale.
function buildAvatarNode(params: OgLandingParams, avatarDataUri: string | undefined): SatoriNode {
  if (avatarDataUri) {
    return {
      type: 'div',
      props: {
        style: {
          width: '96px',
          height: '96px',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
        },
        children: {
          type: 'img',
          props: {
            src: avatarDataUri,
            width: 96,
            height: 96,
            style: { objectFit: 'cover' },
          },
        },
      },
    }
  }

  return {
    type: 'div',
    props: {
      style: {
        width: '96px',
        height: '96px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 40,
        fontWeight: 700,
      },
      children: (Array.from(params.displayName)[0] ?? '').toUpperCase(),
    },
  }
}

function buildCategoriesRow(topCategories: string[]): SatoriNode | undefined {
  if (topCategories.length === 0) return undefined
  return {
    type: 'div',
    props: {
      style: { display: 'flex', flexWrap: 'wrap', gap: '12px' },
      children: topCategories.map((category): SatoriNode => ({
        type: 'div',
        props: {
          style: {
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '24px',
            padding: '8px 20px',
            fontSize: 22,
            fontWeight: 600,
          },
          children: category,
        },
      })),
    },
  }
}

export function buildLandingCardNode(
  params: OgLandingParams,
  avatarDataUri: string | undefined,
): SatoriNode {
  const nameBlock: SatoriNode = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', gap: '4px' },
      children: [
        {
          type: 'div',
          props: { style: { fontSize: 48, fontWeight: 800 }, children: params.displayName },
        },
        {
          type: 'div',
          props: { style: { fontSize: 28, opacity: 0.75 }, children: `@${params.username}` },
        },
      ],
    },
  }

  const topRow: SatoriNode = {
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', gap: '32px' },
      children: [buildAvatarNode(params, avatarDataUri), nameBlock],
    },
  }

  const categoriesRow = buildCategoriesRow(params.topCategories)
  const middleChildren = categoriesRow ? [topRow, categoriesRow] : [topRow]

  const middleBlock: SatoriNode = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', gap: '24px' },
      children: middleChildren,
    },
  }

  const footer: SatoriNode = {
    type: 'div',
    props: { style: { fontSize: 24, opacity: 0.8 }, children: 'voucha.ai' },
  }

  return cardFrame([middleBlock, footer])
}
