#!/bin/sh
set -eu

data_dir="${ANI_DESK_DATA_DIR:-/data}"

if [ "$(id -u)" -eq 0 ]; then
  mkdir -p "$data_dir"
  chown -R ani-desk:ani-desk "$data_dir"
  exec gosu ani-desk "$@"
fi

exec "$@"
