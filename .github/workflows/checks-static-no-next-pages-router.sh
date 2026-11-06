#!/usr/bin/env bash

if [ -d web/pages ] || [ -d web/src/pages ]; then
  echo "::error::Pages Router directory found (Next.js pages router not allowed)"
  exit 1
fi
echo "No pages router directory found"
