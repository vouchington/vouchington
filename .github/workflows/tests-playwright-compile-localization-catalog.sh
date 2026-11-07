#!/usr/bin/env bash
if [ -d /dev/shm ]; then
  export TMPDIR=/dev/shm
  sqlite_path="/dev/shm/vouchington-catalog-$$.sqlite"
else
  sqlite_path="${RUNNER_TEMP}/vouchington-catalog.sqlite"
fi
echo "Compiling localization catalog to $sqlite_path"
node backend/services/localization/compile-cli.mts --source localization/catalog --output "$sqlite_path"
echo "LOCALIZATION_SQLITE_PATH=$sqlite_path" >> "$GITHUB_ENV"
