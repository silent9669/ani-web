#!/bin/sh
set -eu

: "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ZONE_ID:?missing CLOUDFLARE_ZONE_ID}"
: "${CLOUDFLARE_DNS_RECORD_ID:?missing CLOUDFLARE_DNS_RECORD_ID}"
: "${CLOUDFLARE_DNS_NAME:?missing CLOUDFLARE_DNS_NAME}"

public_ip="$(curl -fsS --max-time 10 https://api.ipify.org)"
case "$public_ip" in
  *[!0-9.]*|'')
    printf 'Cloudflare DDNS could not determine a valid public IPv4 address\n' >&2
    exit 1
    ;;
esac

payload="$(jq -nc \
  --arg type A \
  --arg name "$CLOUDFLARE_DNS_NAME" \
  --arg content "$public_ip" \
  '{type:$type,name:$name,content:$content,ttl:1,proxied:true}')"

response="$(curl -fsS --max-time 20 \
  --request PUT \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data "$payload" \
  "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${CLOUDFLARE_DNS_RECORD_ID}")"

if ! printf '%s' "$response" | jq -e '.success == true' >/dev/null; then
  printf 'Cloudflare DDNS update failed\n' >&2
  exit 1
fi

printf 'Cloudflare DDNS update succeeded for %s\n' "$CLOUDFLARE_DNS_NAME"
