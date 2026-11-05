#!/usr/bin/env bash
set -euo pipefail
if find articles -type l -print -quit | grep -q .; then
  echo '::error::Article source contains a symbolic link'
  exit 1
fi
if find articles ! -type f ! -type d -print -quit | grep -q .; then
  echo '::error::Article source contains a non-regular entry'
  exit 1
fi
mkdir -p delivery/articles
find articles -maxdepth 1 -type f -name '*.md' ! -name 'README.md' -exec cp -- {} delivery/articles/ \;
if ! find delivery/articles -type f -name '*.md' -print -quit | grep -q .; then
  echo '::error::Article delivery contains no Markdown files'
  exit 1
fi
if find delivery -type l -print -quit | grep -q .; then
  echo '::error::Article delivery contains a symbolic link'
  exit 1
fi
if find delivery ! -type f ! -type d -print -quit | grep -q .; then
  echo '::error::Article delivery contains a non-regular entry'
  exit 1
fi
