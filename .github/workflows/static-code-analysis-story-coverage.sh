#!/usr/bin/env bash
pnpm exec vouchington story-coverage \
  --root . \
  --component-root web/components/ \
  --story-root web/storybook/ \
  --alias @/=web/ \
  --source-extension .tsx \
  --source-extension .ts \
  --component-extension .tsx \
  --marker "['\"]data-pw['\"]|data-pw=" \
  --story-pattern "[.]stories[.](ts|tsx)$" \
  --exclusions web/storybook/__tests__/component-story-exclusions.json \
  --exclusions-label web/storybook/__tests__/component-story-exclusions.json
