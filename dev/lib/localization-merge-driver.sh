#!/bin/sh
set -eu

repo_root=${1:-.}
common_dir=$(git -C "$repo_root" rev-parse --path-format=absolute --git-common-dir)
common_config="$common_dir/config"

git config --file "$common_config" --replace-all \
  merge.vouchington-localization.name \
  'Merge localization catalog rows'
git config --file "$common_config" --replace-all \
  merge.vouchington-localization.driver \
  'vouchington-localization git-merge %O %A %B --path %P'
