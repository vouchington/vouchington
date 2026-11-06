#!/usr/bin/env bash
HEAD_SHA="$(git rev-parse HEAD)"
BASE_SHA="$(git merge-base origin/main "$HEAD_SHA")"
{
  echo "base=$BASE_SHA"
  echo "head=$HEAD_SHA"
} >> "$GITHUB_OUTPUT"
