---
status: Draft
version: 1.0.0
date: 2026-04-06
title: "MealFlow v1.0 — Comprehensive Improvement Spec"
scope: 100+ actionable improvements across 8 expert perspectives
---

# MealFlow v1.0 — Comprehensive Improvement Spec

> 100+ concrete, testable, individually-scoped improvements to take MealFlow from v0.9.0 (90% backend, 25% frontend) to a shippable v1.0 product.

**Current state:** 206 tests · 116 API routes · 36 DB tables · ~13,000 LOC
**Target:** Complete frontend, harden backend, ship-ready quality

---

## How to Use This Document

Each item is:
- **Concrete** — describes exactly what to build/change
- **Testable** — can write at least one automated test for it
- **Scoped** — ~1–3 hours of work
- **Independent** — can be implemented in any order (dependencies noted where they exist)

Pick items by expert section or cherry-pick across sections. Items are tagged:

| Tag | Meaning |
|-----|---------|
| `[FE]` | Frontend work |
| `[BE]` | Backend work |
| `[DB]` | Database schema change |
| `[TEST]` | Test-only work |
| `[CONFIG]` | Configuration/infrastructure |
| `[DOCS]` | Documentation |

---

## 1. Product Owner — Features That Drive Adoption & Retention

> Focus: What makes a user install, keep using, and recommend MealFlow to another Indian family?

### 1.1 Onboarding & First-Time Experience

| # | Item | Tag | Description |
|---|------|-----|-------------|
| PO-01 | First-login household wizard | `[FE]` | After registration, guide user through: name household → add family members → set dietary types → pick festivals. 4-step wizard with progress bar. Skip option on each step. |
| PO-02 | Sample meal plan seeding | `[BE]` `[FE]` | "Start with a sample week" button that seeds 7 days of meals using top-rated recipes for the household's dietary mix. Endpoint: `POST /api/seed/sample-plan`. |
| PO-03 | Empty-state guidance | `[FE]` | Every empty view (no recipes, no meals, no shopping list) shows illustration + actionable CTA instead of blank screen. E.g., "No meals planned for today → Plan your first meal". |

### 1.2 Core Feature Completion

| # | Item | Tag | Description |
|---|------|-----|-------------|
| PO-04 | Weekly planner view | `[FE]` | 7-day calendar grid showing all 6 meal slots per day. Click cell to add/edit. Swipe weeks. This is the #1 missing UI feature. |
| PO-05 | Household management UI | `[FE]` | Settings → Family: list members, add/edit person profiles, dietary types, spice/sugar sliders, invite link generation. |
| PO-06 | Festival configuration UI | `[FE]` | Settings → Festivals: toggle which festivals each family member observes. Show upcoming festivals with suggested recipes. |
| PO-07 | Polls/voting UI | `[FE]` | Create poll from meal slot ("What should we have for dinner?"), family members vote, winner auto-applies. Show active polls on Today view. |
| PO-08 | Pantry management UI | `[FE]` | Pantry view: list items with quantities and expiry dates. "Running low" and "Expiring soon" badges. Quick-add from shopping list. |
| PO-09 | Settings page | `[FE]` | User preferences: display name, password change, notification preferences, AI provider config, data export/import, theme selection. |
| PO-10 | Meal template UI | `[FE]` | Save current week as template, browse templates, apply template to a date range. |

### 1.3 Engagement & Retention

| # | Item | Tag | Description |
|---|------|-----|-------------|
| PO-11 | Meal rating system | `[BE]` `[DB]` | After eating: rate meal 1–5 stars + optional comment. Table: `meal_ratings(id, meal_plan_item_id, person_id, rating, comment, created_at)`. Show ratings on recipe detail. |
| PO-12 | "What's for today?" push notification | `[FE]` | Morning notification (8 AM configurable) showing today's meal plan summary via the Notification API (PWA). |
| PO-13 | Recipe of the day | `[BE]` `[FE]` | Daily rotating recipe suggestion on the Today view based on: season, dietary match, never-tried, rating. Endpoint: `GET /api/recipes/suggestion/daily`. |
| PO-14 | Quick-add meal from history | `[FE]` | "Repeat recent meal" dropdown on each meal slot showing last 10 meals for that slot. One-tap to copy. |
| PO-15 | Cooking timer integration | `[FE]` | When viewing a recipe, show prep_time and cook_time as startable countdown timers. Use `setInterval` with notification on completion. |

---

## 2. UX Designer — Frontend UI, Flows, Responsiveness, Accessibility

> Focus: Every interaction is intuitive, fast, and works on a ₹15,000 Android phone in portrait mode.

### 2.1 Mobile-First Responsive

| # | Item | Tag | Description |
|---|------|-----|-------------|
| UX-01 | Bottom navigation on mobile | `[FE]` | Hide sidebar on screens <768px. Show fixed bottom nav with 5 icons: Today, Planner, Recipes, Shopping, More. Material Design 3 pattern. |
| UX-02 | Touch-friendly tap targets | `[FE]` | Audit all interactive elements — minimum 44×44px touch targets. Fix buttons, checkboxes, meal slot cards. |
| UX-03 | Swipe gestures on planner | `[FE]` | Swipe left/right to navigate between days on Today view. Use `touchstart`/`touchend` events with 50px threshold. |
| UX-04 | Pull-to-refresh | `[FE]` | On Today and Shopping views, pull down to refresh data. Visual spinner indicator. |

### 2.2 Accessibility (WCAG 2.1 AA)

| # | Item | Tag | Description |
|---|------|-----|-------------|
| UX-05 | ARIA labels on all interactive elements | `[FE]` | Add `aria-label` to icon buttons, `role="dialog"` to modals, `aria-live="polite"` to toast notifications. |
| UX-06 | Keyboard navigation | `[FE]` | Tab through all nav items, Enter to activate, Escape to close modals. Focus trapping inside modals. Visible focus rings. |
| UX-07 | Color contrast audit | `[FE]` | Check all text against WCAG AA (4.5:1 ratio). Current `--text-muted: #64748B` on `--bg-primary: #0F172A` = 4.6:1 (barely passing). Fix `--text-secondary` on cards. |
| UX-08 | Screen reader meal summary | `[FE]` | Add `aria-label` to meal cards: "Lunch: Dal Tadka, Jeera Rice, Raita. 450 calories." Not just visual layout. |

### 2.3 UI Polish

| # | Item | Tag | Description |
|---|------|-----|-------------|
| UX-09 | Skeleton loading states | `[FE]` | Replace blank screens during data fetch with skeleton placeholders (pulsing grey rectangles matching card shapes). |
| UX-10 | Optimistic UI for toggles | `[FE]` | Shopping list check/uncheck, favorite toggle — update UI immediately, revert on API failure. |
| UX-11 | Form validation feedback | `[FE]` | Inline validation messages under inputs (red border + message). Currently errors only show as toasts. |
| UX-12 | Meal slot color coding | `[FE]` | Each meal slot gets a distinct left-border color: breakfast=amber, lunch=green, dinner=indigo, snacks=pink. Consistent across all views. |
| UX-13 | Recipe detail sheet | `[FE]` | Bottom sheet (mobile) or side panel (desktop) for recipe details instead of full modal. Smoother UX for browsing. |
| UX-14 | Search with filters drawer | `[FE]` | Recipe search: expandable filter panel below search bar with cuisine, region, difficulty, dietary type chips. Currently search exists but no filter UI. |
| UX-15 | Empty shopping list celebration | `[FE]` | When all items checked off, show confetti animation + "All done! 🎉" message. Dopamine hit. |

---

## 3. Backend Engineer — API Improvements, Performance, Scalability

> Focus: The API handles real-world usage patterns without degradation.

### 3.1 Performance

| # | Item | Tag | Description |
|---|------|-----|-------------|
| BE-01 | Add database indexes | `[DB]` | Create indexes: `CREATE INDEX idx_meals_date ON meal_plans(date);` `CREATE INDEX idx_meals_user ON meal_plans(user_id);` `CREATE INDEX idx_recipes_user ON recipes(user_id);` `CREATE INDEX idx_ingredients_user ON ingredients(user_id);` `CREATE INDEX idx_pantry_expiry ON pantry(expiry_date);` `CREATE INDEX idx_audit_user ON audit_log(user_id, created_at);` — 6 indexes total. |
| BE-02 | Pagination on list endpoints | `[BE]` | Add `?page=1&limit=20` to: `GET /api/recipes`, `GET /api/ingredients`, `GET /api/shopping/:id/items`, `GET /api/audit`. Return `{ data: [], total: N, page: N, limit: N }`. |
| BE-03 | Response caching with ETags | `[BE]` | Add `ETag` header to recipe list, ingredient list, festival list (rarely changing data). Return `304 Not Modified` when content unchanged. Use content hash. |
| BE-04 | Batch nutrition calculation | `[BE]` | Current `enrichRecipe()` does per-recipe ingredient lookup. For list views, batch all ingredient lookups into a single query with `WHERE recipe_id IN (...)`. |
| BE-05 | Audit log rotation | `[BE]` | `DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')`. Run on startup or via `POST /api/admin/audit/rotate`. Currently unbounded growth. |

### 3.2 API Quality

| # | Item | Tag | Description |
|---|------|-----|-------------|
| BE-06 | OpenAPI spec generation | `[DOCS]` | Create `docs/openapi.yaml` documenting all 116 routes with request/response schemas extracted from Zod schemas. Serve at `/api/docs`. |
| BE-07 | Consistent error response format | `[BE]` | Standardize all error responses to `{ error: string, code: string, details?: object }`. Audit all routes for inconsistent error shapes. |
| BE-08 | Request ID middleware | `[BE]` | Add `X-Request-Id` header (UUID v4) to every response. Include in Pino logs. Enables request tracing. |
| BE-09 | Health check endpoint | `[BE]` | `GET /api/health` returning `{ status: "ok", version: "0.9.0", uptime: N, db: "connected" }`. Used by Docker healthcheck and uptime monitors. |
| BE-10 | Graceful 413 for large payloads | `[BE]` | Set `express.json({ limit: '1mb' })` and return proper 413 status with helpful message for recipe imports that exceed limit. |

### 3.3 New Capabilities

| # | Item | Tag | Description |
|---|------|-----|-------------|
| BE-11 | WebSocket notifications | `[BE]` | Add `ws` package. Broadcast to household members when: meal plan changed, poll created, poll closed. Replaces polling for real-time updates. |
| BE-12 | Ical export | `[BE]` | `GET /api/calendar/ical?start=&end=` returning `.ics` file with meal plan events. Standard format importable by Google Calendar. |
| BE-13 | CSV export for nutrition | `[BE]` | `GET /api/nutrition/export?format=csv&start=&end=` returning CSV of daily nutrition logs. For spreadsheet users. |
| BE-14 | Bulk meal plan operations | `[BE]` | `POST /api/meals/bulk` accepting array of meal plans. For template application and weekly plan generation. Reduces N API calls to 1. |
| BE-15 | Recipe image upload | `[BE]` | `POST /api/recipes/:id/image` accepting multipart form with image. Store in `data/images/`. Serve via `/images/:filename`. Max 2MB, JPEG/PNG/WebP only. |

---

## 4. QA Engineer — Testing, Coverage, Edge Cases, Reliability

> Focus: Every feature has tests, every edge case is handled, CI catches regressions.

### 4.1 Frontend Testing

| # | Item | Tag | Description |
|---|------|-----|-------------|
| QA-01 | Frontend test framework setup | `[TEST]` `[CONFIG]` | Add Playwright for E2E tests. Create `tests/e2e/` directory. Config in `playwright.config.js`. Test auth flow, recipe CRUD, meal plan add. |
| QA-02 | Login flow E2E test | `[TEST]` | Test: register → login → see Today view → logout → redirected to login. Test invalid credentials show error. |
| QA-03 | Recipe CRUD E2E test | `[TEST]` | Test: create recipe with ingredients → shows in list → edit name → delete → gone from list. |
| QA-04 | Meal plan E2E test | `[TEST]` | Test: navigate to Today → add meal item → shows in slot → remove → slot empty. |
| QA-05 | Responsive layout test | `[TEST]` | Playwright tests at 3 viewports: mobile (375×667), tablet (768×1024), desktop (1440×900). Assert sidebar/bottom-nav visibility. |

### 4.2 Backend Edge Cases

| # | Item | Tag | Description |
|---|------|-----|-------------|
| QA-06 | Concurrent meal plan edits | `[TEST]` | Test: two users in same household edit same meal slot simultaneously. Assert no data corruption (SQLite WAL handles this, but verify). |
| QA-07 | Unicode recipe names | `[TEST]` | Test: create recipe with name "पनीर टिक्का" (Hindi), "பனீர் டிக்கா" (Tamil), emoji "🍛 Paneer". Assert search, display, export all work. |
| QA-08 | Date boundary tests | `[TEST]` | Test: meal plans at midnight, across timezones, DST transitions, leap year Feb 29. Assert `GET /api/meals/2028-02-29` works. |
| QA-09 | Empty household edge cases | `[TEST]` | Test: household with 0 persons → meal plan creation → nutrition summary. Assert no divide-by-zero or null ref errors. |
| QA-10 | Shopping list with 0-quantity items | `[TEST]` | Test: recipe with ingredient quantity 0 → generate shopping list → item appears with "to taste" label, not "0 g". |

### 4.3 Reliability

| # | Item | Tag | Description |
|---|------|-----|-------------|
| QA-11 | API contract tests | `[TEST]` | For every endpoint, test that response shape matches documented schema. Use Zod `.parse()` on response bodies in tests. |
| QA-12 | Migration idempotency tests | `[TEST]` | Run all 20 migrations twice in sequence. Assert no errors on second run (all use `IF NOT EXISTS`). |
| QA-13 | Load test with 1000 recipes | `[TEST]` | Seed 1000 recipes, run FTS search, list with pagination, nutrition calculation. Assert response time <500ms. |
| QA-14 | Backup restore test | `[TEST]` | Test: export full backup → delete DB → restore from backup → assert all data intact. |
| QA-15 | Session expiry handling | `[TEST]` | Test: create session → advance time past expiry → make API call → assert 401 → assert frontend redirects to login. |

---

## 5. Security Engineer — Auth, Permissions, Data Protection

> Focus: Multi-user household app means permission boundaries are critical.

### 5.1 Authorization Model

| # | Item | Tag | Description |
|---|------|-----|-------------|
| SEC-01 | Household-scoped data access | `[BE]` | Currently all authenticated users see all data. Add `household_id` check to every query: recipes, meals, shopping lists, persons. A user in Household A must not see Household B's data. |
| SEC-02 | Household role model | `[BE]` `[DB]` | Add `role` column to `users` table: `admin` (can delete household, manage members) vs `member` (can only manage own data). Default: creator = admin. |
| SEC-03 | API endpoint authorization audit | `[TEST]` | Test every endpoint with: (a) no auth → 401, (b) wrong household → 403, (c) member trying admin action → 403. Systematic sweep of all 116 routes. |
| SEC-04 | Rate limit per-user | `[BE]` | Current rate limiting is global. Add per-user rate limiting (100 req/min per user) to prevent one user from exhausting the limit for others. |

### 5.2 Data Protection

| # | Item | Tag | Description |
|---|------|-----|-------------|
| SEC-05 | Password strength validation | `[BE]` | Enforce on registration & change-password: min 8 chars, at least 1 uppercase, 1 number. Return specific error message for each failed rule. |
| SEC-06 | Session invalidation on password change | `[BE]` | When user changes password, invalidate all other sessions (`DELETE FROM sessions WHERE user_id = ? AND sid != ?`). |
| SEC-07 | Account deletion with data wipe | `[BE]` | `DELETE /api/auth/account` — delete user, all their data (CASCADE handles most). Require password confirmation. Return confirmation of deletion. |
| SEC-08 | Input sanitization audit | `[TEST]` | Test all text inputs with: `<script>alert(1)</script>`, `'; DROP TABLE users; --`, `{{constructor.constructor('return this')()}}`. Assert stored as literal text, rendered escaped. |
| SEC-09 | Cookie security flags | `[BE]` | Ensure session cookie has: `HttpOnly`, `SameSite=Strict`, `Secure` (in production), `Path=/`. Audit current cookie settings. |
| SEC-10 | API key encryption validation | `[TEST]` | Test AI config storage: save API key → read from DB directly → assert it's encrypted, not plaintext. Test decryption returns original key. |

### 5.3 Security Headers & Transport

| # | Item | Tag | Description |
|---|------|-----|-------------|
| SEC-11 | Content Security Policy tightening | `[BE]` | Audit current Helmet CSP config. Restrict `script-src` to `'self'`, block `eval`. Allow Google Fonts CDN explicitly. Block all `object-src`. |
| SEC-12 | Dependency vulnerability scan | `[CONFIG]` | Add `npm audit` to CI. Fix any high/critical vulnerabilities. Pin all dependency versions in package-lock.json. |
| SEC-13 | Session token entropy check | `[TEST]` | Assert session tokens are ≥32 bytes of crypto-random. Test that `crypto.randomBytes(32)` is used, not `Math.random()`. |
| SEC-14 | Sensitive data in logs | `[BE]` | Audit Pino logger calls — ensure no password, session token, or API key is ever logged. Add redaction config to Pino: `redact: ['req.headers.cookie', '*.password', '*.api_key']`. |
| SEC-15 | CORS origin whitelist | `[BE]` | Review CORS config. In production, restrict to specific origin (not `*`). In development, allow `localhost:3458`. |

---

## 6. DevOps Engineer — CI/CD, Monitoring, Deployment, Observability

> Focus: Repeatable builds, zero-downtime deploys, know when things break.

### 6.1 CI/CD Pipeline

| # | Item | Tag | Description |
|---|------|-----|-------------|
| DO-01 | GitHub Actions CI workflow | `[CONFIG]` | `.github/workflows/ci.yml`: on push/PR → install → lint → test → build Docker image. Matrix: Node 22. Fail on any test failure. |
| DO-02 | Test coverage reporting | `[CONFIG]` | Add `c8` (Node.js native coverage). Script: `"test:coverage": "c8 node --test tests/*.test.js"`. Fail CI if coverage drops below 70%. |
| DO-03 | Lint CI gate | `[CONFIG]` | ESLint must pass with 0 errors before merge. Add `eslint.config.js` if missing. Run `npm run lint` in CI. |
| DO-04 | Docker multi-stage build | `[CONFIG]` | Optimise Dockerfile: Stage 1 (builder) installs deps. Stage 2 (runtime) copies only `src/`, `public/`, `node_modules/`, `package.json`. Smaller image. |
| DO-05 | Automated database backup | `[CONFIG]` | Cron script or Node scheduler: daily SQLite file copy to `backups/mealflow-YYYY-MM-DD.db`. Keep last 7. Delete older. |

### 6.2 Monitoring & Observability

| # | Item | Tag | Description |
|---|------|-----|-------------|
| DO-06 | Structured request logging | `[BE]` | Ensure every request logs: `{ method, url, status, duration_ms, user_id, request_id }`. Already using Pino — verify all fields present. |
| DO-07 | Error rate tracking | `[BE]` | Count 5xx responses per minute in memory. Expose via `GET /api/health/metrics`. Alert threshold: >10 errors/min. |
| DO-08 | Database size monitoring | `[BE]` | Add to health endpoint: `db_size_mb` (file size of `mealflow.db`). Log warning when >500MB. |
| DO-09 | Startup readiness probe | `[BE]` | Don't accept HTTP requests until DB migrations complete and integrity check passes. Return 503 during startup. Docker healthcheck uses `/api/health`. |
| DO-10 | Graceful shutdown logging | `[BE]` | On SIGTERM: log active connections count, flush audit log, close DB, then exit. Currently `SHUTDOWN_TIMEOUT_MS=10000` — verify it actually waits. |

### 6.3 Deployment

| # | Item | Tag | Description |
|---|------|-----|-------------|
| DO-11 | Docker Compose production profile | `[CONFIG]` | Create `docker-compose.prod.yml` with: volume for `data/`, restart policy `unless-stopped`, memory limit 512MB, no dev dependencies. |
| DO-12 | Environment validation on startup | `[BE]` | On server start, validate all required env vars exist and are valid. Fail fast with clear error message listing missing vars. |
| DO-13 | Changelog generation | `[CONFIG]` | Add conventional commit linting. Auto-generate CHANGELOG.md from git history on release. Script: `scripts/changelog.sh`. |

---

## 7. Data Engineer — Data Model Improvements, Analytics, Reporting

> Focus: The data model supports all current features efficiently and enables analytics.

### 7.1 Schema Improvements

| # | Item | Tag | Description |
|---|------|-----|-------------|
| DE-01 | Add `updated_at` columns | `[DB]` | Add `updated_at DATETIME DEFAULT CURRENT_TIMESTAMP` to: recipes, ingredients, meal_plans, shopping_lists, persons. Use trigger to auto-update on row change. |
| DE-02 | Soft delete for recipes | `[DB]` `[BE]` | Add `deleted_at DATETIME` to recipes. Change DELETE to SET `deleted_at = CURRENT_TIMESTAMP`. Filter `WHERE deleted_at IS NULL` in all queries. Add "Trash" view with restore/permanent-delete. |
| DE-03 | Recipe version history | `[DB]` `[BE]` | Table: `recipe_versions(id, recipe_id, version, data_json, created_at)`. Save snapshot on each update. View history, restore previous version. |
| DE-04 | Shopping list completion tracking | `[DB]` | Add `completed_at DATETIME` to shopping_lists. Track when list was fully checked off. Enables analytics: "average shopping trip duration". |
| DE-05 | Meal plan notes | `[DB]` | Add `notes TEXT DEFAULT ''` to `meal_plans` table. Allow per-day notes like "Birthday party" or "Guests coming". |

### 7.2 Analytics & Reporting

| # | Item | Tag | Description |
|---|------|-----|-------------|
| DE-06 | Most-cooked recipes report | `[BE]` `[FE]` | `GET /api/stats/top-recipes?days=30` — returns recipe names ranked by frequency in meal plans. Show as bar chart on dashboard. |
| DE-07 | Nutrition trend visualization | `[FE]` | Weekly line chart (canvas-based, no library) showing calories, protein, carbs, fat per day for the last 7/30 days. Data already exists via `/api/nutrition/summary`. |
| DE-08 | Ingredient usage frequency | `[BE]` | `GET /api/stats/ingredient-usage?days=30` — which ingredients appear most in meal plans. Helps identify over-reliance on same ingredients. |
| DE-09 | Meal variety score | `[BE]` | `GET /api/stats/variety?days=14` — score 0–100 based on unique recipes / total meals. Show on dashboard: "Your variety score this week: 72/100". |
| DE-10 | Cost trend report | `[BE]` `[FE]` | `GET /api/cost/trend?days=30` — daily meal cost over time. Line chart on dashboard. Requires ingredient pricing data. |
| DE-11 | Festival meal compliance report | `[BE]` | `GET /api/festivals/compliance?date=` — for a festival day, report which persons' meals comply with fasting rules and which don't. |
| DE-12 | Data export in multiple formats | `[BE]` | Extend `GET /api/data/export` with `?format=json|csv`. JSON (current) + CSV (recipes, ingredients, nutrition logs as separate CSV files in a zip). |

---

## 8. Domain Expert (Indian Cuisine) — Cultural Accuracy & Regional Coverage

> Focus: MealFlow must feel like it was built by someone who knows Indian food, not someone who Googled "Indian recipes".

### 8.1 Recipe & Cuisine Completeness

| # | Item | Tag | Description |
|---|------|-----|-------------|
| IC-01 | Regional cuisine coverage audit | `[BE]` | Verify seed data has recipes across all 8 major regional cuisines: North Indian, South Indian, Gujarati, Bengali, Maharashtrian, Rajasthani, Hyderabadi, Goan. Add missing regions. Minimum 30 recipes per region. |
| IC-02 | Meal type classification | `[BE]` `[DB]` | Add `meal_type_tags` to recipes: breakfast-suitable, lunch-suitable, dinner-suitable, snack, tiffin-suitable, chai-accompaniment. Filter suggestions by slot. |
| IC-03 | Thali composition rules | `[BE]` | Validation: a complete thali should have dal/lentil + sabzi/vegetable + roti/rice + accompaniment (raita/chutney/pickle). Warn when meal plan for lunch/dinner is incomplete. |
| IC-04 | Seasonal ingredient flags | `[DB]` `[BE]` | Add `season TEXT` to ingredients: `summer`, `monsoon`, `winter`, `year-round`. Filter: `GET /api/ingredients?season=summer`. Suggest seasonal recipes. |
| IC-05 | Cooking method classification | `[DB]` | Add `cooking_method TEXT` to recipes: tadka, dum, bhuna, tawa, tandoor, steamed, deep-fried, no-cook. Enable filtering by method. |

### 8.2 Festival & Fasting Depth

| # | Item | Tag | Description |
|---|------|-----|-------------|
| IC-06 | Regional festival variations | `[BE]` | Same festival, different food rules by region. Navratri fasting differs between North (no grains, sendha namak only) and South (some grains allowed). Support region-specific rules per festival. |
| IC-07 | Jain dietary rules engine | `[BE]` | Jain diet: no root vegetables (onion, garlic, potato, carrot), no food after sunset. Add as system-level restriction set, auto-filter recipes for Jain persons. |
| IC-08 | Sattvic/Swaminarayan diet support | `[BE]` | Sattvic: no onion, garlic, mushroom, non-veg. Swaminarayan: additionally no leftover food. Validate meal plans against these stricter rulesets. |
| IC-09 | Ekadashi / monthly fasting calendar | `[BE]` | Auto-calculate Ekadashi dates (11th day of lunar fortnight, 2x per month). Add to festival calendar. Common across many Hindu families. |
| IC-10 | Ramadan/Roza meal timing | `[BE]` | During Ramadan: Sehri (pre-dawn) and Iftar (sunset) replace normal meal slots. Add `meal_slot_override` for festival periods. |

### 8.3 Ingredient & Nutrition Accuracy

| # | Item | Tag | Description |
|---|------|-----|-------------|
| IC-11 | Hindi/regional name aliases | `[DB]` `[BE]` | Add `aliases TEXT` (JSON array) to ingredients. E.g., Coriander → ["Dhaniya", "Kothamalli"]. Search should match aliases. |
| IC-12 | Indian unit conversions | `[BE]` | Support traditional Indian measurements: katori (bowl ~150ml), chammach (tablespoon), mutthi (handful ~30g), chai-chammach (teaspoon). Convert to metric for nutrition calculation. |
| IC-13 | IFCT nutrition data validation | `[TEST]` | Cross-check seeded ingredient nutrition values against IFCT (Indian Food Composition Table) 2024. Flag any >20% deviation. |
| IC-14 | Street food / chaat recipes | `[BE]` | Add 20+ street food recipes: pani puri, bhel puri, vada pav, kachori, samosa chaat, dahi puri, etc. Currently underrepresented category. |
| IC-15 | Pickle/achaar/chutney as condiments | `[DB]` `[BE]` | Recipe category `condiment` for items that accompany meals but aren't main dishes. Separate from `side_dish`. Don't count condiment nutrition at full serving. |

---

## Summary Matrix

| Expert | Items | FE | BE | DB | TEST | CONFIG | DOCS |
|--------|-------|-----|-----|-----|------|--------|------|
| Product Owner | 15 | 12 | 5 | 1 | 0 | 0 | 0 |
| UX Designer | 15 | 15 | 0 | 0 | 0 | 0 | 0 |
| Backend Engineer | 15 | 0 | 13 | 1 | 0 | 0 | 1 |
| QA Engineer | 15 | 0 | 0 | 0 | 15 | 1 | 0 |
| Security Engineer | 15 | 0 | 10 | 1 | 5 | 1 | 0 |
| DevOps Engineer | 13 | 0 | 5 | 0 | 0 | 9 | 0 |
| Data Engineer | 12 | 2 | 8 | 5 | 0 | 0 | 0 |
| Domain Expert | 15 | 0 | 12 | 5 | 1 | 0 | 0 |
| **Total** | **115** | **29** | **53** | **13** | **21** | **11** | **1** |

---

## Priority Recommendation

### Ship-blockers (do these first for v1.0)

1. **SEC-01** — Household data isolation (security-critical)
2. **PO-04** — Weekly planner view (core UX)
3. **PO-01** — Onboarding wizard (first impression)
4. **PO-05** — Household management UI (core feature)
5. **UX-01** — Mobile bottom navigation (most users are on mobile)
6. **BE-01** — Database indexes (performance baseline)
7. **DO-01** — CI pipeline (quality gate)
8. **QA-01** — Frontend test setup (regression safety)

### High-value quick wins (1 hour each)

1. **PO-03** — Empty state guidance
2. **BE-09** — Health check endpoint
3. **UX-09** — Skeleton loading states
4. **BE-05** — Audit log rotation
5. **SEC-09** — Cookie security flags
6. **DO-12** — Environment validation
7. **DE-01** — `updated_at` columns
8. **IC-11** — Hindi/regional ingredient aliases

### Differentiators (what makes MealFlow unique)

1. **IC-03** — Thali composition rules
2. **IC-06** — Regional festival variations
3. **IC-07** — Jain dietary rules engine
4. **IC-12** — Indian unit conversions
5. **PO-07** — Polls/voting UI
6. **PO-06** — Festival configuration UI
7. **DE-09** — Meal variety score
8. **DE-11** — Festival compliance report
