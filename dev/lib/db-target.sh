#!/usr/bin/env bash
# Source this file to resolve the effective dev PostgreSQL target for
# schema-writing and destructive commands.

if ! declare -F db_name_from_url >/dev/null 2>&1; then
  # shellcheck source=dev/lib/db-name-from-url.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/db-name-from-url.sh"
fi

dev_db_target_opt_in_env() {
  local operation=$1
  case "$operation" in
    init) printf '%s' "VOUCHA_ALLOW_NON_LOCAL_DB_INIT" ;;
    reset) printf '%s' "VOUCHA_ALLOW_NON_LOCAL_DB_RESET" ;;
    clean) printf '%s' "VOUCHA_ALLOW_NON_LOCAL_DB_CLEAN" ;;
    cleanup) printf '%s' "VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP" ;;
    teardown) printf '%s' "VOUCHA_ALLOW_NON_LOCAL_DB_TEARDOWN" ;;
    *)
      printf 'unknown dev DB operation: %s\n' "$operation" >&2
      return 2
      ;;
  esac
}

dev_db_target_default_database_url() {
  local db_name=$1
  local default_pg_host default_pg_authority
  default_pg_host="${PGHOST:-localhost}"
  default_pg_authority="$default_pg_host"
  if [[ "$default_pg_host" == *:* && "$default_pg_host" != \[* ]]; then
    default_pg_authority="[$default_pg_host]"
  fi
  if [ -n "${PGPORT:-}" ]; then
    default_pg_authority="$default_pg_authority:$PGPORT"
  fi
  printf 'postgres://%s/%s' "$default_pg_authority" "$db_name"
}

dev_db_target_display_database_url() {
  local database_url=${1:-}
  local db_name=${2:-}
  local userinfo password scheme host_authority display_db_name

  if [ -z "$database_url" ] && [ -n "$db_name" ]; then
    database_url="$(dev_db_target_default_database_url "$db_name")"
  fi
  [ -z "$database_url" ] && return 0

  userinfo=$(DATABASE_URL="$database_url" db_userinfo_from_url)
  password=$(DATABASE_URL="$database_url" db_password_from_url)
  if [ -z "$userinfo" ] && [ -z "$password" ]; then
    printf '%s' "$database_url"
    return 0
  fi

  scheme="${database_url%%://*}"
  if [ "$scheme" = "$database_url" ]; then
    scheme=postgres
  fi
  host_authority=$(DATABASE_URL="$database_url" db_authority_from_url)
  display_db_name=$db_name
  if [ -z "$display_db_name" ]; then
    display_db_name=$(DATABASE_URL="$database_url" db_name_from_url)
  fi

  printf '%s://***@%s' "$scheme" "$host_authority"
  [ -n "$display_db_name" ] && printf '/%s' "$display_db_name"
}

dev_db_target_resolve() {
  local operation=$1
  local database_url=${2:-${DATABASE_URL:-}}
  local fallback_db_name=${3:-}

  DEV_DB_TARGET_OPERATION="$operation"
  DEV_DB_TARGET_ALLOW_ENV="$(dev_db_target_opt_in_env "$operation")"
  DEV_DB_TARGET_DATABASE_URL="$database_url"
  if [ -z "$DEV_DB_TARGET_DATABASE_URL" ] && [ -n "$fallback_db_name" ]; then
    DEV_DB_TARGET_DATABASE_URL="$(dev_db_target_default_database_url "$fallback_db_name")"
  fi

  if [ -n "$DEV_DB_TARGET_DATABASE_URL" ]; then
    export DATABASE_URL="$DEV_DB_TARGET_DATABASE_URL"
  fi

  DEV_DB_TARGET_DB_NAME="$(db_name_from_url)"
  if [ -z "$DEV_DB_TARGET_DB_NAME" ]; then
    DEV_DB_TARGET_DB_NAME="$fallback_db_name"
  fi

  export DEV_DB_TARGET_OPERATION DEV_DB_TARGET_ALLOW_ENV
  export DEV_DB_TARGET_DATABASE_URL DEV_DB_TARGET_DB_NAME
}

dev_db_target_export_if_url_has_value() {
  local env_name=$1
  local value=$2
  [ -z "$value" ] && return 0
  export "$env_name=$value"
}

dev_db_target_export_pg_env() {
  local db_host db_hostaddr db_port db_user db_password
  local db_service db_servicefile db_target_session_attrs
  local param value env_name

  db_host=$(db_host_from_url)
  db_hostaddr=$(db_hostaddr_from_url)
  db_port=$(db_port_from_url)
  db_user=$(db_user_from_url)
  db_password=$(db_password_from_url)
  db_service="$(db_query_param_from_url service)"
  db_servicefile="$(db_query_param_from_url servicefile)"
  db_target_session_attrs="$(db_query_param_from_url target_session_attrs)"

  if [ -n "$db_host" ]; then
    [ -z "$db_hostaddr" ] && unset PGHOSTADDR
    unset PGSERVICE PGSERVICEFILE
    export PGHOST="$db_host"
  fi
  if [ -n "$db_hostaddr" ]; then
    unset PGSERVICE PGSERVICEFILE
    export PGHOSTADDR="$db_hostaddr"
  fi
  if [ -n "$db_port" ]; then
    export PGPORT="$db_port"
  fi
  dev_db_target_export_if_url_has_value PGUSER "$db_user"
  dev_db_target_export_if_url_has_value PGPASSWORD "$db_password"
  if [ -n "$db_service" ]; then
    unset PGHOST PGHOSTADDR
    export PGSERVICE="$db_service"
  fi
  if [ -n "$db_servicefile" ]; then
    export PGSERVICEFILE="$db_servicefile"
  fi
  dev_db_target_export_if_url_has_value PGTARGETSESSIONATTRS "$db_target_session_attrs"

  for param in sslmode sslcert sslkey sslrootcert sslcrl sslcrldir; do
    value="$(db_query_param_from_url "$param")"
    [ -z "$value" ] && continue
    case "$param" in
      sslmode) env_name=PGSSLMODE ;;
      sslcert) env_name=PGSSLCERT ;;
      sslkey) env_name=PGSSLKEY ;;
      sslrootcert) env_name=PGSSLROOTCERT ;;
      sslcrl) env_name=PGSSLCRL ;;
      sslcrldir) env_name=PGSSLCRLDIR ;;
      *) continue ;;
    esac
    export "$env_name=$value"
  done
}

dev_db_target_is_local() {
  # Safety checks intentionally apply URL-derived PG env so subsequent libpq calls use the same target.
  dev_db_target_export_pg_env
  pg_database_target_is_local
}

dev_db_target_local_or_allowed() {
  local operation=${1:-${DEV_DB_TARGET_OPERATION:-}}
  local allow_env allow_value
  if [ -n "$operation" ]; then
    allow_env="$(dev_db_target_opt_in_env "$operation")"
  else
    allow_env="${DEV_DB_TARGET_ALLOW_ENV:-}"
  fi

  if dev_db_target_is_local; then
    return 0
  fi

  if [ -n "$allow_env" ]; then
    allow_value="${!allow_env:-}"
    [ "$allow_value" = "1" ] && return 0
  fi

  return 1
}
