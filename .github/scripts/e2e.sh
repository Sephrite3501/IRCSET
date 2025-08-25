#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:3005"

tmpdir="$(mktemp -d)"
ADMIN="${tmpdir}/admin.cookies"
AUTHOR="${tmpdir}/author.cookies"
CHAIR="${tmpdir}/chair.cookies"
REV="${tmpdir}/rev.cookies"
DM="${tmpdir}/dm.cookies"

cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

echo "%PDF-1.4
1 0 obj<</Type/Catalog>>endobj
trailer<</Root 1 0 R>>
%%EOF" > "${tmpdir}/seed.pdf"

echo "---- Auth: admin login"
curl -sS -i -c "$ADMIN" -b "$ADMIN" -H "Content-Type: application/json" \
  -d '{"email":"admin1@example.com","password":"StrongP@ssw0rd!"}' \
  "$BASE/auth/login" | sed -n '1,3p' >/dev/null

echo "---- Admin: list categories"
curl -sS -b "$ADMIN" "$BASE/admin/categories" >/dev/null

echo "---- Admin: create extra reviewer via API"
CSRF=$(awk '$6=="csrf-token"{print $7}' "$ADMIN" | tail -n1)
curl -sS -b "$ADMIN" -H "X-CSRF-Token: $CSRF" -H "Content-Type: application/json" \
  -d '{"email":"rev2@example.com","name":"Reviewer Two","password":"StrongP@ssw0rd!","role":"reviewer","categories":["A"]}' \
  "$BASE/admin/users" >/dev/null

echo "---- Author login"
curl -sS -i -c "$AUTHOR" -b "$AUTHOR" -H "Content-Type: application/json" \
  -d '{"email":"author1@example.com","password":"StrongP@ssw0rd!"}' \
  "$BASE/auth/login" >/dev/null

echo "---- Author: fetch CSRF and create submission"
curl -sS -c "$AUTHOR" -b "$AUTHOR" "$BASE/csrf-token" >/dev/null
ACSRF=$(awk '$6=="csrf-token"{print $7}' "$AUTHOR" | tail -n1)
formfile="${tmpdir}/form.txt"
# Create submission (category A)
curl -sS -i -c "$AUTHOR" -b "$AUTHOR" -H "X-CSRF-Token: $ACSRF" \
  -F "title=Seed Paper A" \
  -F "category_id=A" \
  -F "pdf=@${tmpdir}/seed.pdf;type=application/pdf" \
  "$BASE/submissions" > "${tmpdir}/sub_create.txt"
SUB_ID=$(grep -oE '"id":[0-9]+' "${tmpdir}/sub_create.txt" | head -n1 | cut -d: -f2)
test -n "$SUB_ID"

echo "---- Chair login + assign reviewer"
curl -sS -i -c "$CHAIR" -b "$CHAIR" -H "Content-Type: application/json" \
  -d '{"email":"chair1@example.com","password":"StrongP@ssw0rd!"}' \
  "$BASE/auth/login" >/dev/null
CCSRF=$(awk '$6=="csrf-token"{print $7}' "$CHAIR" | tail -n1)
# reviewer1 id is 3rd created user normally; ask API for reviewers in A
curl -sS -b "$CHAIR" "$BASE/chair/reviewers?category=A" > "${tmpdir}/reviewers.json"
RID=$(jq -r '.items[0].id' "${tmpdir}/reviewers.json")
curl -sS -b "$CHAIR" -H "X-CSRF-Token: $CCSRF" -H "Content-Type: application/json" \
  -d "{\"reviewers\":[$RID],\"due_at\":\"2025-12-31\"}" \
  "$BASE/chair/submissions/${SUB_ID}/assign" >/dev/null

echo "---- Reviewer login + submit review"
curl -sS -i -c "$REV" -b "$REV" -H "Content-Type: application/json" \
  -d '{"email":"reviewer1@example.com","password":"StrongP@ssw0rd!"}' \
  "$BASE/auth/login" >/dev/null
RCSRF=$(awk '$6=="csrf-token"{print $7}' "$REV" | tail -n1)
curl -sS -b "$REV" -H "X-CSRF-Token: $RCSRF" -H "Content-Type: application/json" \
  -d '{"score_overall":8.5,"comments_for_author":"Looks good","comments_confidential":"n/a"}' \
  "$BASE/reviewer/submissions/${SUB_ID}/reviews" >/dev/null

echo "---- Decision Maker login + accept"
curl -sS -i -c "$DM" -b "$DM" -H "Content-Type: application/json" \
  -d '{"email":"dm1@example.com","password":"StrongP@ssw0rd!"}' \
  "$BASE/auth/login" >/dev/null
DCSRF=$(awk '$6=="csrf-token"{print $7}' "$DM" | tail -n1)
curl -sS -b "$DM" "$BASE/decisions/queue" > /dev/null
curl -sS -b "$DM" -H "X-CSRF-Token: $DCSRF" -H "Content-Type: application/json" \
  -d '{"decision":"accepted","reason":"Great work"}' \
  "$BASE/decisions/${SUB_ID}" >/dev/null

echo "---- Author uploads FINAL (membership bypassed)"
curl -sS -c "$AUTHOR" -b "$AUTHOR" "$BASE/csrf-token" >/dev/null
ACSRF=$(awk '$6=="csrf-token"{print $7}' "$AUTHOR" | tail -n1)
echo "%PDF-1.4
% final
%%EOF" > "${tmpdir}/final.pdf"
curl -sS -i -c "$AUTHOR" -b "$AUTHOR" -H "X-CSRF-Token: $ACSRF" \
  -F "pdf=@${tmpdir}/final.pdf;type=application/pdf" \
  "$BASE/submissions/${SUB_ID}/final" | tee "${tmpdir}/final_resp.txt" >/dev/null
grep -q '"ok":true' "${tmpdir}/final_resp.txt"

echo "---- Chair downloads final (inline)"
curl -sS -i -b "$CHAIR" "$BASE/submissions/${SUB_ID}/final.pdf" > "${tmpdir}/dl_headers.txt"
grep -qi '^content-type: application/pdf' "${tmpdir}/dl_headers.txt"
grep -qi '^content-disposition: inline' "${tmpdir}/dl_headers.txt"

echo "---- Metrics require key"
curl -sS -H "Authorization: Bearer secret" "$BASE/metrics" >/dev/null

echo "E2E smoke: OK"
