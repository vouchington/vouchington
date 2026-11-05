#!/usr/bin/env bash
postgres_url="postgres://postgres@localhost:${POSTGRES_PORT}/postgres"
{
  echo "DATABASE_URL=${postgres_url}"
  echo "READ_DATABASE_URL=${postgres_url}"
} >> "$GITHUB_ENV"
