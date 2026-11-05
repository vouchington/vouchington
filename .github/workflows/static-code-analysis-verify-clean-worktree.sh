#!/usr/bin/env bash
if ! git diff --exit-code; then
  echo "::error::Static analysis produced changes. Run the documented local checks and commit the results."
  git diff --stat
  exit 1
fi
