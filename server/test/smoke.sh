#!/usr/bin/env bash
# End-to-end smoke test against a running API.
#
# Exercises the paths that carry authorization decisions, and asserts the
# denials as well as the successes — a suite that only checked happy paths
# would have passed against the pre-hardening code that let any user
# promote themselves to super_admin.
#
#   BASE=http://localhost:4000 ./test/smoke.sh
#
# Optionally set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to also exercise
# the super-admin routes; those checks are skipped when they are absent.
#
# One run fits inside the public rate limits (it registers six accounts
# against a limit of ten an hour). A second run within the hour will not:
# start the server with RATE_LIMIT_DISABLED=true for repeated runs, which
# is honoured outside production only.
set -uo pipefail

BASE="${BASE:-http://localhost:4000}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0; SKIP=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m %s (%s)\n' "$1" "$2"; FAIL=$((FAIL+1)); }
skip() { printf '  \033[33mSKIP\033[0m %s\n' "$1"; SKIP=$((SKIP+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$3', got '$2'"; fi; }

# req METHOD PATH COOKIEJAR|- BODY|-   -> prints status code, body in $TMP/body
req() {
  local method=$1
  local path=$2
  local jar=$3
  local body=$4
  local args
  args=(-s -o "$TMP/body" -w '%{http_code}' -X "$method")
  if [ "$jar" != "-" ]; then args+=(-b "$jar" -c "$jar"); fi
  if [ "$body" != "-" ]; then args+=(-H 'content-type: application/json' -d "$body"); fi
  curl "${args[@]}" "$BASE$path"
}

# Read a dotted path out of the last response body. jq is not assumed to be
# installed; python3 ships on every target this runs on.
jget() {
  python3 -c '
import json,sys
try: data=json.load(open(sys.argv[1]))
except Exception: print("<unparseable>"); sys.exit()
for part in sys.argv[2].split("."):
    if data is None: break
    if isinstance(data,list):
        try: data=data[int(part)]
        except Exception: data=None
    elif isinstance(data,dict): data=data.get(part)
    else: data=None
print("null" if data is None else data)
' "$TMP/body" "$1"
}

STAMP=$(date +%s%N)
OWNER_EMAIL="owner-$STAMP@example.test"
STAFF_EMAIL="staff-$STAMP@example.test"
PW='TestPassword123!'

echo "== health =="
check "health returns 200" "$(req GET /health - -)" 200

echo
echo "== registration & session =="
code=$(req POST /api/auth/register "$TMP/owner.jar" \
  "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PW\",\"full_name\":\"Owner One\",
    \"pharmacy\":{\"name\":\"Test Pharmacy $STAMP\",\"email\":\"ph-$STAMP@example.test\",
    \"city\":\"Harare\",\"suburb\":\"Avondale\",\"lat\":-17.8,\"lng\":31.03}}")
check "register pharmacy owner" "$code" 201
PHARMACY_ID=$(jget 'pharmacy.id')
if [ "$PHARMACY_ID" != "null" ]; then ok "pharmacy created"; else bad "pharmacy created" "no id"; fi

req GET /api/auth/me "$TMP/owner.jar" - >/dev/null
check "owner role is pharmacy_admin" "$(jget 'role')" pharmacy_admin

check "duplicate email rejected" \
  "$(req POST /api/auth/register - "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PW\",\"full_name\":\"Dup\"}")" 409
check "weak password rejected" \
  "$(req POST /api/auth/register - '{"email":"weak@example.test","password":"short","full_name":"X"}')" 400
check "malformed email rejected" \
  "$(req POST /api/auth/register - '{"email":"not-an-email","password":"LongEnough123","full_name":"X"}')" 400

req GET /api/auth/me - - >/dev/null
check "anonymous /me returns null" "$(jget '')" null

echo
echo "== privilege escalation attempts =="
# The exact attack the gate-1 audit found. Under the old system a user
# could write their own role via user_metadata and RLS believed it.
req POST /api/auth/register "$TMP/staff.jar" \
  "{\"email\":\"$STAFF_EMAIL\",\"password\":\"$PW\",\"full_name\":\"Staff One\",
    \"global_role\":\"super_admin\"}" >/dev/null
req GET /api/auth/me "$TMP/staff.jar" - >/dev/null
check "self-assigned global_role ignored at signup" "$(jget 'profile.global_role')" pharmacy_staff

check "non-admin cannot list users"     "$(req GET /api/admin/users "$TMP/staff.jar" -)" 403
check "non-admin cannot read audit log" "$(req GET /api/admin/audit "$TMP/staff.jar" -)" 403
check "non-admin cannot read stats"     "$(req GET /api/admin/stats "$TMP/staff.jar" -)" 403
check "non-admin cannot set roles" \
  "$(req POST "/api/admin/users/00000000-0000-4000-8000-000000000000/role" "$TMP/staff.jar" '{"role":"super_admin"}')" 403
check "non-admin cannot write drug catalogue" \
  "$(req POST /api/drugs "$TMP/staff.jar" '{"generic_name":"Sneaky"}')" 403

echo
echo "== cross-tenant isolation =="
check "outsider cannot read stock"          "$(req GET "/api/stock/$PHARMACY_ID" "$TMP/staff.jar" -)" 403
check "outsider cannot read pharmacy"       "$(req GET "/api/pharmacies/$PHARMACY_ID" "$TMP/staff.jar" -)" 403
check "outsider cannot write stock"         "$(req POST "/api/stock/$PHARMACY_ID" "$TMP/staff.jar" '{"drug_name":"Hijack","quantity":1}')" 403
check "outsider cannot read approvals"      "$(req GET "/api/approvals/$PHARMACY_ID" "$TMP/staff.jar" -)" 403
check "outsider cannot invite staff"        "$(req POST "/api/pharmacies/$PHARMACY_ID/invitations" "$TMP/staff.jar" '{"email":"x@example.test"}')" 403
check "unauthenticated stock read rejected" "$(req GET "/api/stock/$PHARMACY_ID" - -)" 401
check "unauthenticated events rejected"     "$(req GET /api/events - -)" 401

echo
echo "== stock lifecycle =="
check "owner creates stock" \
  "$(req POST "/api/stock/$PHARMACY_ID" "$TMP/owner.jar" \
     '{"drug_name":"Paracetamol","strength":"500mg","form":"tablet","quantity":40,"unit_price":2.5,"threshold":10}')" 201
STOCK_ID=$(jget 'id')

check "owner lists stock" "$(req GET "/api/stock/$PHARMACY_ID" "$TMP/owner.jar" -)" 200
check "stock total is 1"  "$(jget 'total')" 1
check "computed status IN_STOCK" "$(jget 'items.0.stock_status')" IN_STOCK

check "owner updates stock" "$(req PATCH "/api/stock/$PHARMACY_ID/$STOCK_ID" "$TMP/owner.jar" '{"quantity":5}')" 200
req GET "/api/stock/$PHARMACY_ID" "$TMP/owner.jar" - >/dev/null
check "status recomputed to LOW_STOCK" "$(jget 'items.0.stock_status')" LOW_STOCK

check "bulk upsert accepted" \
  "$(req POST "/api/stock/$PHARMACY_ID/bulk" "$TMP/owner.jar" \
     '{"items":[{"drug_name":"Paracetamol","strength":"500mg","form":"tablet","quantity":99,"threshold":10}]}')" 200
req GET "/api/stock/$PHARMACY_ID" "$TMP/owner.jar" - >/dev/null
check "bulk upsert updated rather than duplicated" "$(jget 'total')" 1
check "bulk upsert applied new quantity" "$(jget 'items.0.quantity')" 99

echo
echo "== search =="
check "search responds"      "$(req GET '/api/search?q=paracetamol' - -)" 200
check "empty query rejected" "$(req GET '/api/search?q=' - -)" 400
req GET '/api/search/intent?q=running%20stomach' - - >/dev/null
check "symptom intent detected" "$(jget 'intent')" symptom
req GET '/api/search/intent?q=amoxicillin' - - >/dev/null
check "drug intent detected"    "$(jget 'intent')" drug
check "public pharmacy list"    "$(req GET /api/pharmacies/public - -)" 200

# The public endpoints are unauthenticated, so their rate limits are the
# only thing bounding what an anonymous caller can spend. This asserts the
# limiter is actually mounted here — cheaply, by looking for the header it
# sets, rather than by spending an allowance to provoke a 429.
ratelimit_header=$(curl -s -o /dev/null -D - "$BASE/api/search?q=paracetamol" \
  | grep -ci '^ratelimit-limit:')
check "search advertises a rate limit" "$ratelimit_header" 1

echo
echo "== validation =="
check "bad uuid in path rejected" "$(req GET /api/stock/not-a-uuid "$TMP/owner.jar" -)" 400
check "unknown route 404s"        "$(req GET /api/does-not-exist - -)" 404
check "reservation requires pharmacy_id" \
  "$(req POST /api/reservations - '{"drug_name":"X","patient_name":"Y","patient_phone":"0771234567"}')" 400
check "reservation to unknown pharmacy 404s" \
  "$(req POST /api/reservations - '{"pharmacy_id":"00000000-0000-4000-8000-000000000000","drug_name":"X","patient_name":"Y","patient_phone":"0771234567"}')" 404

echo
echo "== auth hardening =="
check "wrong password rejected"   "$(req POST /api/auth/login - "{\"email\":\"$OWNER_EMAIL\",\"password\":\"wrong\"}")" 401
check "unknown email rejected"    "$(req POST /api/auth/login - '{"email":"ghost@example.test","password":"whatever123"}')" 401
check "correct password accepted" "$(req POST /api/auth/login "$TMP/relog.jar" "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PW\"}")" 200
check "logout succeeds"           "$(req POST /api/auth/logout "$TMP/relog.jar" -)" 204
req GET /api/auth/me "$TMP/relog.jar" - >/dev/null
check "session dead after logout" "$(jget '')" null
check "forgot-password hides whether account exists" \
  "$(req POST /api/auth/password/forgot - '{"email":"nobody-here@example.test"}')" 200
check "password reset rejects bogus token" \
  "$(req POST /api/auth/password/reset - '{"token":"made-up","password":"NewPassword123"}')" 400

echo
echo "== email =="
check "test-email requires a session" "$(req POST /api/profile/test-email - -)" 401
# Both must answer identically, or the endpoint enumerates accounts.
known=$(req POST /api/auth/password/forgot - "{\"email\":\"$OWNER_EMAIL\"}")
unknown=$(req POST /api/auth/password/forgot - '{"email":"definitely-not-here@example.test"}')
check "forgot-password answers the same for known and unknown" "$known" "$unknown"
check "reset link with a bogus token is refused" \
  "$(req POST /api/auth/password/reset - '{"token":"not-a-real-token","password":"NewPassword123"}')" 400
# Control characters are the raw material for a forged Subject line.
check "control characters in a pharmacy name are rejected" \
  "$(req POST /api/auth/register - "{\"email\":\"ctl-$STAMP@example.test\",\"password\":\"TestPassword123!\",\"full_name\":\"Ctl\",\"pharmacy\":{\"name\":\"Evil\\r\\nBcc: a@b.test\",\"email\":\"ctlph-$STAMP@example.test\"}}")" 400

echo
echo "== super admin (optional) =="
if [ -n "${SEED_ADMIN_EMAIL:-}" ] && [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
  code=$(req POST /api/auth/login "$TMP/admin.jar" \
    "{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}")
  check "super admin logs in" "$code" 200
  check "super admin role"    "$(jget 'role')" super_admin
  ADMIN_ID=$(jget 'profile.id')

  check "super admin lists users"  "$(req GET /api/admin/users "$TMP/admin.jar" -)" 200
  check "super admin reads stats"  "$(req GET /api/admin/stats "$TMP/admin.jar" -)" 200
  check "super admin reads audit"  "$(req GET /api/admin/audit "$TMP/admin.jar" -)" 200
  # Carried over from admin_set_global_role(): blocks self-promotion and
  # the self-demotion that would strand the system with no admin.
  check "super admin cannot change own role" \
    "$(req POST "/api/admin/users/$ADMIN_ID/role" "$TMP/admin.jar" '{"role":"pharmacy_staff"}')" 400
  check "super admin can approve a pharmacy" \
    "$(req POST "/api/admin/pharmacies/$PHARMACY_ID/status" "$TMP/admin.jar" '{"status":"APPROVED"}')" 200
  req GET '/api/search?q=paracetamol' - - >/dev/null
  check "approved pharmacy now appears in search" "$(jget 'results.0.drug_name')" Paracetamol
  check "hard delete refused before trashing" \
    "$(req DELETE "/api/admin/users/$ADMIN_ID" "$TMP/admin.jar" -)" 400
else
  skip "super admin checks (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD)"
fi

echo
printf '%d passed, %d failed, %d skipped\n' "$PASS" "$FAIL" "$SKIP"
[ "$FAIL" -eq 0 ]
