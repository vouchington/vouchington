#!/usr/bin/env bash
if [ -f coverage/lcov.info ]; then
  mkdir -p coverage-full
  cp coverage/lcov.info coverage-full/lcov.info
fi
