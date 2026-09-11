#!/usr/bin/env bash

# Fix bullmq sourcemap references by removing sourcemap comments

# Get the directory of this script and navigate to backend root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BULLMQ_PATH="$BACKEND_DIR/node_modules/bullmq/dist/esm"

if [ ! -d "$BULLMQ_PATH" ]; then
  echo "bullmq not found, skipping sourcemap fix"
  exit 0
fi

echo "Fixing bullmq sourcemap references..."

# Find all .js files and remove sourcemap comments
# Use different sed syntax for macOS vs Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  find "$BULLMQ_PATH" -type f -name "*.js" -exec sed -i '' '/^\/\/# sourceMappingURL=/d' {} +
else
  # Linux
  find "$BULLMQ_PATH" -type f -name "*.js" -exec sed -i '/^\/\/# sourceMappingURL=/d' {} +
fi

echo "Fixed sourcemap comments in $BULLMQ_PATH"
