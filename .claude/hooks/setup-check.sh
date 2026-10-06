#!/bin/bash
# Runs at session start. Stdout is injected into Claude's context.

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 1

# --- .env checks ---
env_key_is_set() {
  local key="$1"
  local value

  value="${!key}"
  [ -n "$value" ] || value=$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' .env 2>/dev/null)
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"

  [ -n "$value" ] || return 1

  case "$value" in
    your_*_key_here|changeme|CHANGE_ME|TODO|todo)
      return 1
      ;;
  esac

  return 0
}

print_key_help() {
  local key="$1"
  local purpose="$2"
  local url="$3"

  echo "$key is missing in .env."
  echo "   Used for: $purpose"
  echo "   Tell the user to visit this URL to create or copy the key: $url"
}

env_file_exists=1
if [ ! -f .env ]; then
  env_file_exists=0
  echo ".env is missing."
fi

missing_env_key=0

if ! env_key_is_set "WORLD_LABS_API_KEY"; then
  print_key_help "WORLD_LABS_API_KEY" "world generation" "https://platform.worldlabs.ai/"
  missing_env_key=1
fi

if ! env_key_is_set "OPENAI_API_KEY"; then
  print_key_help "OPENAI_API_KEY" "image editing; Image Model capabilities: Request" "https://platform.openai.com/api-keys"
  missing_env_key=1
fi

if ! env_key_is_set "TRIPO_API_KEY"; then
  print_key_help "TRIPO_API_KEY" "3D models" "https://platform.tripo3d.ai/"
  missing_env_key=1
fi

if [ "$missing_env_key" -eq 1 ]; then
  echo "   Edit local .env with missing key values. Keep keys out of chat."
fi

# --- worlds/ status ---
if [ -d worlds ] && [ "$(ls worlds/ 2>/dev/null | wc -l | tr -d ' ')" -gt 0 ]; then
  WORLD_LIST=$(ls worlds/)
  echo "Worlds available: $(echo "$WORLD_LIST" | wc -l | tr -d ' ') — $(echo "$WORLD_LIST" | tr '\n' ' ')"
else
  echo "No worlds yet. Use /scenra-project to set up a project, then Agent(scenra-world) for non-blocking world generation."
fi

# --- input/ staging ---
if [ -d input ]; then
  FILES=$(ls input/ 2>/dev/null | grep -v '^$' | tr '\n' ' ')
  [ -n "$FILES" ] && echo "Staged in input/: $FILES"
fi

exit 0
