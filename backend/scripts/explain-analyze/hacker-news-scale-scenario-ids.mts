export const HACKER_NEWS_SCALE_SHAPES = ['sparse', 'zero', 'related'] as const
export const HACKER_NEWS_SCALE_SORTS = ['new', 'best', 'hot'] as const
export const HACKER_NEWS_SCALE_WINDOWS = ['1y', 'all'] as const
export const HACKER_NEWS_SCALE_CACHE_STATES = ['cold', 'warm'] as const

export const HACKER_NEWS_SCALE_SCENARIO_IDS = [
  ...HACKER_NEWS_SCALE_SHAPES.flatMap(shape =>
    HACKER_NEWS_SCALE_SORTS.flatMap(sort =>
      HACKER_NEWS_SCALE_WINDOWS.flatMap(window =>
        (['first', 'continuation'] as const).flatMap(page =>
          HACKER_NEWS_SCALE_CACHE_STATES.map(
            cache => `hacker-news-scale-${shape}-${sort}-${window}-${page}-${cache}`,
          ),
        ),
      ),
    ),
  ),
  ...HACKER_NEWS_SCALE_CACHE_STATES.map(cache => `hacker-news-scale-unvoted-sidecar-${cache}`),
] as const
