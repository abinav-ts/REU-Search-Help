#!/usr/bin/env bash
# Checks that your free-tier keys work, before any code is written.
# Usage (keys stay in your shell, never in a file):
#   export FIRECRAWL_API_KEY=...   # from firecrawl.dev dashboard
#   export GEMINI_API_KEY=...      # from Google AI Studio
#   bash scripts/smoke-test.sh
# Cloudflare is checked separately in M0 with `npx wrangler login` / `wrangler whoami`.

set -u
fail=0

echo "== Gemini: models available to your key (Flash-class only) =="
if [ -z "${GEMINI_API_KEY:-}" ]; then echo "GEMINI_API_KEY not set"; fail=1; else
  curl -sS "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    | python3 -c 'import sys,json
d=json.load(sys.stdin)
if "error" in d: print("ERROR:", d["error"].get("message")); sys.exit(1)
names=[m["name"].split("/")[-1] for m in d.get("models",[]) if "flash" in m["name"] and "generateContent" in m.get("supportedGenerationMethods",[])]
print("\n".join(sorted(names)) or "none found")' || fail=1
  echo
  echo "== Gemini: one tiny JSON call (set GEMINI_MODEL to a name printed above) =="
  MODEL="${GEMINI_MODEL:-}"
  if [ -z "$MODEL" ]; then echo "GEMINI_MODEL not set, skipping. Re-run with: GEMINI_MODEL=<name> bash scripts/smoke-test.sh"; else
    # --max-time 40: give up after 40 s so a slow model can't hang the script. Prints how long it took.
    curl -sS --max-time 40 -w '\n[took %{time_total}s, HTTP %{http_code}]\n' \
      "https://generativelanguage.googleapis.com/v1beta/models/$MODEL:generateContent" \
      -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" \
      -d '{"contents":[{"parts":[{"text":"Return JSON {\"ok\":true}"}]}],"generationConfig":{"responseMimeType":"application/json"}}' \
      | head -c 800; echo
  fi
fi

echo
echo "== Firecrawl: search 'IAS summer research fellowship' (limit 3) =="
if [ -z "${FIRECRAWL_API_KEY:-}" ]; then echo "FIRECRAWL_API_KEY not set"; fail=1; else
  # If this 404s, the endpoint version changed: check the current Firecrawl docs and fix this URL.
  curl -sS -X POST "https://api.firecrawl.dev/v2/search" \
    -H "Authorization: Bearer $FIRECRAWL_API_KEY" -H "Content-Type: application/json" \
    -d '{"query":"IAS summer research fellowship","limit":3}' | head -c 1200; echo
fi

echo
[ $fail -eq 0 ] && echo "Done. Paste the output into the chat if anything looks wrong." || echo "Some keys missing; fix and re-run."
