#!/usr/bin/env bash
# Checks whether a domain is set up to send mail that survives a spam filter.
#
#   ./test/check-email-dns.sh pharmconnect.co.zw [dkim-selector]
#
# Sending works without any of this. Arriving does not: a new domain with no
# SPF, DKIM or DMARC lands in junk, and a password reset in a junk folder is
# the same as no password reset.
#
# Queries over DNS-over-HTTPS rather than `dig`, because the local resolver
# is the thing most likely to be broken or to be answering from a stale
# cache on the machine you happen to be checking from.
set -uo pipefail

DOMAIN="${1:-}"
SELECTOR="${2:-}"

if [ -z "$DOMAIN" ]; then
  echo "usage: $0 <domain> [dkim-selector]" >&2
  exit 2
fi

PASS=0; FAIL=0; WARN=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$1"; WARN=$((WARN+1)); }

# Resolve NAME/TYPE, printing one record per line. TXT records are returned
# by the API in quoted, possibly split form; strip the quotes and rejoin,
# since a long DKIM key is always split across strings.
resolve() {
  curl -s -m 15 -H 'accept: application/dns-json' \
    "https://dns.google/resolve?name=$1&type=$2" |
  python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for answer in data.get("Answer") or []:
    value = answer.get("data", "")
    if value.startswith("\""):
        value = "".join(part for part in value.split("\" \"")).strip("\"")
    print(value)
'
}

echo "== $DOMAIN =="

# --- Does the domain exist at all -----------------------------------------
if [ -z "$(resolve "$DOMAIN" NS)" ]; then
  bad "domain does not resolve — nothing below can exist until it is registered and its nameservers answer"
  echo
  echo "0 passed, 1 failed"
  exit 1
fi
ok "domain resolves"

# --- SPF: which servers may send as this domain ---------------------------
spf=$(resolve "$DOMAIN" TXT | grep -i '^v=spf1' || true)
spf_count=$(printf '%s' "$spf" | grep -c . || true)

if [ "$spf_count" -eq 0 ]; then
  bad "no SPF record. Receivers have nothing saying your provider may send as $DOMAIN"
elif [ "$spf_count" -gt 1 ]; then
  # More than one is a permanent error, not a merge: receivers are required
  # to fail the check outright, so two "correct" records are worse than one.
  bad "$spf_count SPF records. RFC 7208 permits exactly one — receivers treat this as permerror. Merge them into a single record"
else
  ok "SPF present: $spf"
  case "$spf" in
    *'-all'*) ok "SPF ends in -all (hard fail for anything else)" ;;
    *'~all'*) ok "SPF ends in ~all (soft fail — fine while you are still adding senders)" ;;
    *'+all'*) bad "SPF ends in +all, which authorises the entire internet to send as you" ;;
    *)        warn "SPF has no 'all' mechanism; receivers default to neutral, which is close to having none" ;;
  esac
fi

# --- DKIM: the signature receivers check the mail against ------------------
# Selectors are chosen by the provider, and there is no way to enumerate
# them from DNS — a wildcard query returns nothing. These are the defaults
# of the providers this project is likely to use; pass yours as $2.
selectors=("$SELECTOR" google brevo1 brevo2 zmail resend s1 s2 mail dkim k1 selector1 selector2 pm-bounces)
found_dkim=""
revoked_dkim=""
for s in "${selectors[@]}"; do
  [ -z "$s" ] && continue
  record=$(resolve "${s}._domainkey.$DOMAIN" TXT | grep -i 'v=DKIM1' || true)
  [ -z "$record" ] && continue

  # An empty p= is not a key, it is a revocation — the record exists and
  # every signature against it fails. Checking only that the record is
  # present would report this as healthy, which is how it stays broken.
  if printf '%s' "$record" | grep -qiE 'p=[A-Za-z0-9+/]'; then
    found_dkim="$s"
    break
  fi
  revoked_dkim="$s"
done

if [ -n "$found_dkim" ]; then
  ok "DKIM key published at ${found_dkim}._domainkey.$DOMAIN"
elif [ -n "$revoked_dkim" ]; then
  bad "DKIM record at ${revoked_dkim}._domainkey.$DOMAIN has an empty p= — that is a revoked key, and every signature against it fails"
elif [ -n "$SELECTOR" ]; then
  bad "no DKIM key at ${SELECTOR}._domainkey.$DOMAIN"
else
  bad "no DKIM key at any common selector. Pass your provider's selector as the second argument to be sure"
fi

# --- DMARC: what to do when the other two fail, and where to report --------
dmarc=$(resolve "_dmarc.$DOMAIN" TXT | grep -i '^v=DMARC1' || true)
if [ -z "$dmarc" ]; then
  bad "no DMARC record at _dmarc.$DOMAIN. Gmail and Yahoo now require one from bulk senders"
else
  ok "DMARC present: $dmarc"
  case "$dmarc" in
    *'p=none'*)       warn "policy is p=none — monitoring only, nothing is rejected. Correct for the first weeks; do not leave it here" ;;
    *'p=quarantine'*) ok "policy is p=quarantine" ;;
    *'p=reject'*)     ok "policy is p=reject" ;;
    *)                bad "DMARC record has no p= policy tag" ;;
  esac
  case "$dmarc" in
    *rua=*) ok "aggregate reports are being sent somewhere (rua)" ;;
    *)      warn "no rua= address, so you will never see who is failing your policy" ;;
  esac
fi

# --- MX: informational ----------------------------------------------------
# Not needed to send. But a no-reply address that bounces every reply is a
# deliverability signal in itself, and someone will reply to a reset email.
if [ -n "$(resolve "$DOMAIN" MX)" ]; then
  ok "MX present (replies and bounces have somewhere to go)"
else
  warn "no MX record — mail sent to this domain bounces, including replies to your no-reply address"
fi

echo
echo "$PASS passed, $FAIL failed, $WARN warnings"
[ "$FAIL" -eq 0 ]
