#!/usr/bin/env bash

set -euo pipefail

standalone_dir=".next/standalone/web"
static_dir=".next/static"
public_dir="public"

mkdir -p "$standalone_dir/.next"
rm -rf "$standalone_dir/.next/static" "$standalone_dir/public"

if [ -d "$static_dir" ]; then
  cp -R "$static_dir" "$standalone_dir/.next/static"
fi

if [ -d "$public_dir" ]; then
  cp -R "$public_dir" "$standalone_dir/public"
fi
