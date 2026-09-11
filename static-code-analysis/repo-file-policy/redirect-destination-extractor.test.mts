import { describe, expect, it } from 'vitest'

import { extractRedirectDestinations } from './redirect-destination-extractor.mts'

describe('redirect destination AST extractor', () => {
  function extract(content: string) {
    return extractRedirectDestinations(content, 'web/next.config.ts')
  }

  it('does not collect string-literal destination properties now owned by no-mistakes', () => {
    expect(
      extract(`
        const nextConfig = {
          redirects: async () => [
            { source: '/old', destination: '/missing', permanent: true },
          ],
        }
      `),
    ).toMatchObject({
      bodyFound: true,
      destinations: [],
      sawDestinationProperty: true,
    })
  })

  it('extracts ownerPrivatePaths tuple destinations', () => {
    expect(
      extract(`
        const nextConfig = {
          async redirects() {
            const ownerPrivatePaths = [['/settings', 'settings']]
            return []
          },
        }
      `),
    ).toMatchObject({
      destinations: ['/settings'],
      sawOwnerPrivatePaths: true,
      sawOwnerPrivatePathsTuple: true,
    })
  })

  it('flags hoisted ownerPrivatePaths references as an unsupported tuple shape', () => {
    expect(
      extract(`
        const ownerPrivatePaths = [['/settings', 'settings']]
        const nextConfig = {
          async redirects() {
            return [
              { source: '/how-it-works', destination: '/', permanent: true },
              ...ownerPrivatePaths.map(([source, destination]) => ({
                source,
                destination: \`/my/\${destination}\`,
                permanent: true,
              })),
            ]
          },
        }
      `),
    ).toMatchObject({
      destinations: [],
      sawOwnerPrivatePaths: true,
      sawOwnerPrivatePathsTuple: false,
    })
  })

  it('keeps destination properties outside redirects out of scope', () => {
    expect(
      extract(`
        const nextConfig = {
          async rewrites() {
            return [{ source: '/ghost', destination: '/ghost', permanent: false }]
          },
        }
      `),
    ).toMatchObject({
      bodyFound: false,
      destinations: [],
      sawDestinationProperty: false,
    })
  })
})
