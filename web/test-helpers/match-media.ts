type MediaQueryListStub = Pick<MediaQueryList, 'matches' | 'media'>

/** Modern MediaQueryList members used by matchMedia tests. */
export function createMediaQueryListStub(query: string, matches: boolean): MediaQueryListStub {
  return {
    matches,
    media: query,
  }
}
