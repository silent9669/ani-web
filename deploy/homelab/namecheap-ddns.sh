#!/bin/sh
set -eu

: "${NAMECHEAP_DDNS_HOST:?missing NAMECHEAP_DDNS_HOST}"
: "${NAMECHEAP_DDNS_DOMAIN:?missing NAMECHEAP_DDNS_DOMAIN}"
: "${NAMECHEAP_DDNS_PASSWORD:?missing NAMECHEAP_DDNS_PASSWORD}"

response="$(curl -fsS --get \
  --data-urlencode "host=${NAMECHEAP_DDNS_HOST}" \
  --data-urlencode "domain=${NAMECHEAP_DDNS_DOMAIN}" \
  --data-urlencode "password=${NAMECHEAP_DDNS_PASSWORD}" \
  https://dynamicdns.park-your-domain.com/update)"

if ! printf '%s' "$response" | grep -q '<ErrCount>0</ErrCount>'; then
  printf 'Namecheap DDNS update failed\n' >&2
  exit 1
fi

printf 'Namecheap DDNS update succeeded for %s.%s\n' \
  "$NAMECHEAP_DDNS_HOST" "$NAMECHEAP_DDNS_DOMAIN"
