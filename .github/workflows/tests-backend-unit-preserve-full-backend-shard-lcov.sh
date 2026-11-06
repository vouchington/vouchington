#!/usr/bin/env bash
if [ ! -s coverage/lcov.info ]; then
  echo "::error::Backend shard did not write coverage/lcov.info" >&2
  exit 1
fi
rm -rf coverage-merge-input
mkdir -p coverage-full coverage-merge-input/parent
cp coverage/lcov.info coverage-merge-input/parent/lcov.info
./ci/node_modules/.bin/coverage-check merge \
  --artifacts coverage-merge-input \
  --output coverage-full/lcov.info
