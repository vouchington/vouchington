#!/usr/bin/env bash
# Source this file to use env_file_quote_value and env_file_export_line.
#
# Quotes the values ./dev/initialize writes to the worktree .env so that `source .env`
# (bash/zsh) and `node --env-file=.env` (a dotenv parser) read the same string. `printf %q`
# is not safe for the Node side: it backslash-escapes spaces and metacharacters, and dotenv
# keeps those backslashes as literal characters.
#
#   no single quote                  'VALUE'  both parsers read it verbatim
#   single quote, none of " $ ` \    "VALUE"  nothing for the shell to expand, nothing for Node to unescape
#   single quote plus any of " $ ` \ rejected: no spelling both parsers agree on ('\'' ends the
#                                    value early for Node; "..." needs backslash escapes that
#                                    Node keeps literally)
#
# A rejected value is named by KEY only; the value is never printed.

env_file_quote_value() {
    local key=$1
    local value=$2

    case $value in
        *\'*) ;;
        *)
            printf "'%s'" "$value"
            return 0
            ;;
    esac
    # shellcheck disable=SC1003 # '\' is a literal backslash pattern, not an escaped quote.
    case $value in
        *'"'* | *'$'* | *'`'* | *'\'*)
            echo "Error: $key contains a single quote together with a double quote, dollar sign, backtick, or backslash, which 'source .env' and 'node --env-file=.env' cannot read identically. Remove or encode one of those characters (percent-encode it in a URL) and rerun." >&2
            return 1
            ;;
    esac
    printf '"%s"' "$value"
}

env_file_export_line() {
    local key=$1
    local value=$2
    local quoted

    quoted=$(env_file_quote_value "$key" "$value") || return 1
    printf 'export %s=%s\n' "$key" "$quoted"
}
