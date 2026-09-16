# SECURITY-GOAL.md — Vila 27: security hardening + polish

This file is the source of truth for the `/goal` run. Read it fully before touching code.
All user-facing text must be **Slovak with correct diacritics**. Code, comments, and reports may be English.

## 0. Context (what already exists — verify, don't assume)

- Restaurant Vila 27 (Bešeňová). Static HTML/CSS pages (index, jedálny lístok, kontakt, objednávka + subpages).
- Hosted on Vercel (project `vila27sitevol2`, Hobby plan, testing phase).
- Serverless API: `api/orders.js`, `api/queue.js`, `api/_store.js`.
- Order queue in Upstash Redis via REST, with an in-memory fallback.
- `/admin` = self-refreshing order board for staff, protected by `PRINT_TOKEN` (same token as the queue API).
- Local print agent (Node 18+, zero npm deps) polls `/api/queue` every 5 s, builds ESC/POS itself (CP852 map), prints via Windows `copy /b` to a shared USB printer; tcp/command/file transports also exist. Double-print protection: server-side ID set + local `vytlacene.json`.
- Receipt = info for staff only, no prices (`receipt.showPrices` toggle).
- Brand: official Vila 27 SVG logos, font Source Sans Pro. Original content source: https://www.vila27.sk/sk/
- Known open items before launch: prices come from the browser, no opening-hours check, no rate limit, no Redis TTL/GDPR retention.

Start with a **recon step**: list every file, every endpoint + HTTP method, every env var, every place user input flows (form → API → Redis → admin board → print agent → printer), every third-party request the pages make, and every cookie / localStorage / sessionStorage write. Save it to `docs/security/inventory.md`.

## Ground rules

1. Work on git branch `security-hardening`. Small commits, one concern per commit, clear messages.
2. **Never deploy to production** (`vercel --prod` is forbidden). Test locally with `vercel dev` (or a plain Node harness if `vercel dev` isn't available).
3. **Never print real secret values** into the conversation or any file. Never change env vars in the Vercel dashboard — list required changes in the report.
4. Never invent legal/company data (company name, IČO, DIČ, registered address, contact e-mail). Use visible placeholders like `[DOPLNIŤ: IČO]` and list every one in the report.
5. Don't break the ordering flow or the print agent. Don't add runtime npm dependencies to the API or the agent; dev-only test tooling is OK if justified. Prefer vanilla JS.
6. Keep the existing visual identity (logo, Source Sans Pro, colors, header/footer). New pages must look like they belong to the same site.
7. Tests must never be skipped, deleted, or weakened to get a green run.
8. This is not legal advice; build to the requirements below and flag anything that needs a lawyer/owner decision as NEEDS MARTIN.

## 1. Research (time-boxed, ~10–15 searches)

Use web search/fetch to check what forums and recent reports (2025–2026) say are the most common security problems in AI-generated / "vibe-coded" websites: e.g. r/vibecoding, r/webdev, Hacker News threads, OWASP Top 10 (latest edition), and reports such as:
- https://www.securityweek.com/vibe-coded-apps-riddled-with-exploitable-security-flaws/ (Xint.io: missing rate limiting/DoS most common, then authorization/IDOR; hardcoded secrets = top critical)
- https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/
- https://github.com/benavlabs/vibe-check (17-item list)

Write `docs/security/research.md`: short summary per issue + source link + "applies to Vila 27? yes/no + why". Every "yes" must map to an item in section 2 (add new items under **K. Extra findings** if needed).

## 2. Security checklist (every item → implemented / already OK / NEEDS MARTIN)

### A. Secrets & what the server exposes
- A1. No secrets in client-side files or anywhere in git history (scan working tree + `git log -p` for tokens, Upstash URLs/keys, `PRINT_TOKEN` values). If a real secret was ever committed → NEEDS MARTIN: rotate it.
- A2. `.env*`, agent config with the token, `vytlacene.json`, logs → in `.gitignore`. Provide `.env.example` / `config.example.json` with placeholders.
- A3. **Vercel serves repo files statically.** Make sure nothing except the public site is reachable: `/.env`, `/.git/config`, `/agent/**`, `/docs/**` (the security report must NOT be public!), `/tests/**`, `/scripts/**`, `/SECURITY-GOAL.md`, `/package.json`, `/vercel.json`, `/api/_store`, `/vytlacene.json` must all return 404. Use a `public/` output directory and/or `.vercelignore` — choose the cleanest option and verify with HTTP requests.
- A4. Remove internal/debug info from public responses (e.g. `storage: "redis"` in `/api/orders`, stack traces, Redis error text). If a health check is useful, put it behind the token.

### B. Authentication (queue API + /admin)
- B1. Token check **fails closed**: if `PRINT_TOKEN` is unset or shorter than 32 chars, every protected request is rejected (watch for `undefined === undefined` style bugs).
- B2. Constant-time comparison (`crypto.timingSafeEqual` on equal-length buffers).
- B3. Token only via `Authorization: Bearer` header — never in the URL/query string (leaks into logs, history, Referer). Update admin board and print agent accordingly.
- B4. Every method on every protected endpoint requires the token; public `/api/orders` accepts only `POST` (no public listing of orders — they contain personal data). Other methods → 405 with `Allow` header.
- B5. Rate-limit failed auth attempts per IP (e.g. 10 / 15 min → 429).
- B6. `/admin`: login screen that keeps the token in `sessionStorage` (not in the URL), shows no data without a valid token, logout button, `noindex` + `X-Robots-Tag: noindex`, `Cache-Control: no-store`.

### C. Order input & business logic
- C1. **Prices are computed only on the server** from `menu.json` (single source of truth, also used by the menu page). Any price/total sent by the client is ignored.
- C2. Strict schema validation: known item IDs only; quantity integer 1–20; max 30 lines per order; name/phone/address/note length limits; Slovak/international phone format; reject unknown fields; trim; normalize Unicode.
- C3. Body size limit (~10 KB → 413); `Content-Type: application/json` required (→ 415); malformed JSON → 400 with a generic Slovak message.
- C4. **Opening hours enforced server-side** in `Europe/Bratislava` time from a config file (weekly hours + closed dates). Use real hours from vila27.sk if available, otherwise `[DOPLNIŤ]`. Front-end shows a clear "closed" state.
- C5. **ESC/POS injection:** customer text ends up on a thermal printer. Strip all control characters (0x00–0x1F, 0x7F, and C1 0x80–0x9F) from every text field on the server **and again in the agent** before building ESC/POS (defense in depth). Use an allowlist: printable ASCII + characters present in the CP852 map; everything else → `?`. A note containing `ESC p` (cash-drawer kick) or `GS V` (cut) must print as harmless text.
- C6. **Stored XSS in /admin:** order data must be rendered with `textContent` / DOM APIs only — no `innerHTML`, `insertAdjacentHTML`, or template-string HTML with order data.
- C7. Anti-spam without third-party services: honeypot field + minimum time-to-submit; prepare (but don't require) an optional Turnstile hook, disabled unless env keys exist.
- C8. Idempotency: client sends a random order key; server ignores duplicates for a short window; submit button disabled while sending.
- C9. Same-origin check on `POST /api/orders` (reject foreign `Origin` → 403). No `Access-Control-Allow-Origin: *` anywhere.

### D. Rate limiting, DoS, cost
- D1. Per-IP limit on `POST /api/orders` using Upstash (e.g. 5 per 10 min) + a global cap (e.g. 60 per hour) → 429 with a friendly Slovak message. Use the client IP header set by Vercel and document the assumption.
- D2. **In-memory fallback must not be used in production** — on serverless it silently loses orders. In production (`VERCEL_ENV=production`) Redis failure → 503 "Objednávky sú dočasne nedostupné, zavolajte nám…" with the phone number. Memory fallback allowed only in local dev.
- D3. Review the agent's 5 s polling against current Vercel Hobby and Upstash free-tier limits (look them up). If it's a risk, poll only during opening hours and/or back off when idle. Report the numbers.
- D4. Timeouts on all outbound fetches (Redis REST, agent → API) with exponential backoff in the agent.

### E. Personal data (GDPR)
- E1. Orders and the printed-ID set in Redis get a TTL (`ORDER_TTL_DAYS`, default 30, configurable). No keys without expiry.
- E2. No full personal data in logs (mask phone, no full order bodies in `console.log`).
- E3. Page **Ochrana osobných údajov** (privacy notice, GDPR art. 13): what is collected in the order form, purpose, legal basis, retention (matches E1), recipients (Vercel, Upstash — check their regions), rights, contact. Operator details as `[DOPLNIŤ]`.
- E4. Order form: short notice + link to the privacy page next to the submit button. No pre-ticked checkboxes.

### F. Cookies & consent (Slovak law 452/2021 Z. z., § 109 ods. 8 + GDPR)
- F1. Inventory everything the site stores or loads from third parties (cookies, localStorage, sessionStorage, Google Maps iframe, Google Fonts, analytics, embeds).
- F2. **Self-host Source Sans Pro** (no requests to Google Fonts).
- F3. Cookie banner in Slovak, vanilla JS, no external CMP, CSP-compatible (no inline JS):
  - buttons **Prijať všetko**, **Odmietnuť všetko**, **Nastavenia** with equal visual weight (no dark patterns);
  - categories: Nevyhnutné (always on, explained), Externý obsah (maps), Analytické (ready for future use); nothing pre-ticked;
  - nothing non-essential runs/loads before consent; scripts gated via e.g. `type="text/plain" data-consent="analytics"`;
  - consent saved with version + timestamp, expires after 12 months, re-asked when the policy version changes;
  - banner doesn't block reading the page; keyboard accessible, focus-trapped settings dialog, proper ARIA, respects reduced motion;
  - **"Nastavenia cookies"** link in the footer of every page to change or withdraw consent anytime.
- F4. Google Maps (kontakt page): click-to-load placeholder until "Externý obsah" is allowed, plus a plain "Otvoriť v Mapách Google" link as an alternative.
- F5. Page **Zásady používania cookies** with a table generated from the real inventory: name, provider, purpose, duration, category.

### G. Security headers (`vercel.json`), verified by tests
- G1. `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` — adjust only where truly needed, **never** `'unsafe-inline'`/`'unsafe-eval'` for scripts. Move inline scripts, `onclick=` handlers and inline styles into files.
- G2. `Strict-Transport-Security: max-age=63072000; includeSubDomains` (no `preload` — NEEDS MARTIN decision later with the real domain).
- G3. `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.
- G4. API + admin responses: `Cache-Control: no-store`. Static assets: sensible long caching for fingerprinted/static files.
- G5. Any third-party script (ideally none) → Subresource Integrity + pinned version.

### H. Errors & leakage
- H1. Generic Slovak error messages to the client, details only in server logs (without personal data).
- H2. Remove HTML comments with internal notes/TODOs, debug flags, console noise in production.

### I. Dependencies & supply chain
- I1. If `package.json` exists (create a minimal one for scripts if missing): lockfile committed, `npm audit` clean or explained, every dependency verified to be a real, maintained package (no hallucinated names).

### J. Print agent
- J1. Agent talks to the API over HTTPS only, TLS verification on (no `NODE_TLS_REJECT_UNAUTHORIZED=0`), token from env/local config not in git, sent as Bearer header.
- J2. **Command injection:** the `command`/`windows` transports must never put order data into a shell string. Use `execFile`/`spawn` with an argument array and a fixed temp-file path pattern.
- J3. `vytlacene.json` pruned (keep e.g. last 7 days) so it can't grow forever; corrupt file → safe recovery.
- J4. Sanitization from C5 applied in the agent too; a `file` / dry-run transport exists for testing.

### K. Extra findings
Anything from the research or recon not covered above.

## 3. Polish

- P1. **Custom 404 page** (`404.html`), Slovak, on-brand (logo, header/footer), friendly short copy, links to Domov / Jedálny lístok / Objednávka / Kontakt, `noindex`. Must return real **HTTP 404** (not a soft 200) — verify.
- P2. Friendly error/empty states on the order page: closed, rate-limited (429), server unavailable (503), network error, success confirmation with order summary.
- P3. Footer on every page: operator info (`[DOPLNIŤ]`), Ochrana osobných údajov, Zásady cookies, Nastavenia cookies.
- P4. SEO & meta: `lang="sk"`, unique `<title>` + meta description, Open Graph tags, canonical, favicon set + `apple-touch-icon` + `site.webmanifest`, `robots.txt` (disallow `/admin`, `/api` — remember it isn't security), `sitemap.xml`, `cleanUrls` in `vercel.json`.
- P5. `/.well-known/security.txt` with a `[DOPLNIŤ]` contact and an expiry date.
- P6. Accessibility pass: labels on all inputs, `autocomplete`/`inputmode` on the form, alt texts, visible focus styles, skip link, colour contrast, works at 320 px width.
- P7. Performance: images compressed with width/height set, `loading="lazy"` below the fold, no render-blocking third-party requests.

## 4. Tests (minimum) — `npm run security:check`

Use Node's built-in test runner (`node --test`), no heavy deps. `npm run security:check` must: start or target a local server (`BASE_URL` env, default local), run all tests, run the secret scan (A1), and print a **PASS/FAIL table** per checklist item. Exit code 0 only if everything passes.

Unit:
- price calc ignores client prices; unknown item → error; qty 0 / 21 / 1.5 / "5" → error
- sanitizer strips `\x1b\x70\x00\x19\xfa` (drawer kick) and `\x1d\x56\x00` (cut) and keeps "Šťastný žltý kôň"
- token check rejects when env unset, env too short, wrong token, token of different length
- rate limiter logic (mocked store)
- opening hours: open / closed / closed-date / timezone edge around midnight
- admin render function uses no HTML injection (payload `<img src=x onerror=alert(1)>` ends up as text)
- agent command transport builds an args array, never a shell string

HTTP (against the local server):
- security headers (G1–G4) present on `/`, a subpage, `/admin`, `/api/orders`
- `GET/PUT/DELETE /api/orders` → 405; `/api/queue` without token → 401, wrong token → 401, token in query string → 401
- valid order → 200/201 and server total matches `menu.json`, even when the client sends `price: 0.01`
- oversized body → 413; wrong content type → 415; broken JSON → 400; foreign `Origin` → 403; honeypot filled → rejected
- 6th order from one IP inside the window → 429
- outside opening hours → rejected with Slovak message
- every path from A3 → 404
- `/neexistuje` → status 404 and body contains the custom 404 marker
- no response body contains stack traces or `storage`

E2E (use Playwright or the browser tool if available; otherwise add a manual checklist to the report):
- before consent: no non-essential storage, no Maps iframe, no request to Google; after "Odmietnuť všetko" the same; after "Prijať všetko" the map loads; footer link reopens settings
- full flow: order → appears on `/admin` → agent in `file` transport writes a correct receipt (Slovak diacritics OK, no prices, sanitized note)

## 5. Final report

Write `docs/security/REPORT.md` (not publicly served — see A3) and print it in full at the end:
1. Table: checklist ID → status (Fixed / Already OK / NEEDS MARTIN) → evidence (test name or file:line).
2. `npm run security:check` summary.
3. **NEEDS MARTIN** list: secrets to rotate, env vars to add in Vercel (`ORDER_TTL_DAYS`, etc.), every `[DOPLNIŤ]` placeholder, legal review of privacy/cookie pages, Vercel Hobby vs. commercial use, HSTS preload decision, printer/agent install at the restaurant, customer SMS/e-mail confirmation (out of scope).
