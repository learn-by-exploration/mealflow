# MealFlow — Claude Code Configuration

> **Last updated:** 6 April 2026 · **Version:** 1.0.0
> **Metrics:** 559 tests | 39 test files | 144 API routes | 45 DB tables (incl. FTS) | 24 route modules | 36 migrations | ~16,000 LOC

## Project Overview

**India-focused family meal planning app** — the only tool purpose-built for Indian households coordinating multi-course meals (thali model) across family members with different dietary needs, spice tolerances, and fasting schedules.

Multi-user Express.js backend + vanilla JS SPA frontend. SQLite via better-sqlite3.
Self-hosted, no cloud dependency. Works on any device with a browser.

**5 novel features with zero competition worldwide:**
1. Per-person dish customization within a group meal
2. Poll-based family meal decisions
3. Per-person spice/sugar level profiling (1–5 scale)
4. Festival/occasion-aware auto-planning (20–30+ Indian festivals)
5. Per-dish special requests ("less oil for Dad")

**Design docs:** `docs/design/requirements.md` · `docs/design/implementation-plan.md`

## Quick Start

```bash
npm install
node src/server.js          # http://localhost:3458
npm test                    # 559 tests via node:test
# or with Docker:
docker compose up --build -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3458` | Server port |
| `DB_DIR` | `./data` | Directory for `mealflow.db` |
| `NODE_ENV` | `development` | Environment (development/production/test) |
| `LOG_LEVEL` | `info` | Pino log level (silent/error/warn/info/debug) |
| `RATE_LIMIT_MAX` | `200` | Max requests per window (global) |
| `RATE_LIMIT_PER_USER_MAX` | `100` | Max requests per user per window |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |
| `TRUST_PROXY` | (unset) | Set to `1` or `true` behind reverse proxy |
| `ALLOWED_ORIGINS` | `http://localhost:3458` | Comma-separated CORS origins |
| `SESSION_MAX_AGE_DAYS` | `7` | Default session duration |
| `SESSION_REMEMBER_DAYS` | `30` | Remember-me session duration |
| `BCRYPT_SALT_ROUNDS` | `12` | bcrypt salt rounds |
| `AUTH_LIMIT_WINDOW_MS` | `900000` | Auth rate limit window (15 min) |
| `AUTH_LIMIT_MAX` | `20` | Max auth attempts per window |
| `BACKUP_RETAIN_COUNT` | `7` | Number of backups to keep |
| `BACKUP_INTERVAL_HOURS` | `24` | Backup interval in hours |
| `BASE_URL` | (empty) | Base URL for iCal/links |

See `.env.example` for all variables.

## Architecture

**Backend:**
```
src/
  server.js           — Express app entry, 24 route modules, graceful shutdown, health checks
  config.js           — Centralized config (dotenv, Object.freeze, Zod env validation)
  logger.js           — Pino structured logging with redaction
  errors.js           — AppError classes (NotFoundError, ValidationError, etc.)
  helpers.js          — Shared utilities (enrichRecipe, calcRecipeNutrition, getNextPosition, etc.)
  validate-env.js     — Zod-based environment validation on startup
  ws.js               — WebSocket server for household notifications
  db/
    index.js          — SQLite schema, 13 inline tables, WAL mode, foreign keys, integrity checks
    migrate.js        — SQL migration runner (_migrations table)
    migrations/       — 36 versioned SQL migration files (001–036)
  routes/
    auth.js           — Register, login, logout, session, change-password, delete account (6 routes)
    recipes.js        — CRUD, search, filter, reorder, favorite, clone, scale, soft-delete, versions, suggestion (18 routes)
    ingredients.js    — CRUD, bulk create, filter, alias search (6 routes)
    meals.js          — Meal plans CRUD, items, copy, bulk ops, recurrence, leftovers, templates, completeness (16 routes)
    tags.js           — Tags CRUD with recipe counts (4 routes)
    nutrition.js      — Nutrition log, goals, daily/weekly summary, person nutrition, alerts (11 routes)
    shopping.js       — Shopping lists CRUD, generate from plans, toggle, pantry subtract, deep links, share (12 routes)
    stats.js          — Dashboard, nutrition trends, top ingredients, top recipes, variety score, ingredient usage (6 routes)
    data.js           — Export (JSON/CSV), backup (2 routes)
    households.js     — Household CRUD, invite codes, join, person count (6 routes)
    persons.js        — Person CRUD, festival selection, spice/sugar profiles (6 routes)
    festivals.js      — Festivals CRUD, upcoming, compliance, Ekadashi, regional variants (8 routes)
    polls.js          — Polls CRUD, vote, close, apply (6 routes)
    templates.js      — Meal templates CRUD, apply (5 routes)
    pantry.js         — Pantry CRUD with expiry tracking (5 routes)
    purchases.js      — Purchase history (2 routes)
    seed.js           — Seed ingredients, recipes, festivals, sample plans (4 routes)
    import.js         — Recipe import from URL (1 route)
    notifications.js  — Notification preferences and list (4 routes)
    calendar.js       — Calendar view with iCal export (3 routes)
    ai.js             — AI config CRUD, suggestion endpoints (4 routes)
    cost.js           — Cost estimation, trend report (4 routes)
    ratings.js        — Meal ratings CRUD (3 routes)
    units.js          — Indian unit conversions (2 routes)
  schemas/            — 12 Zod validation schemas
    common.schema.js  — Shared validators (positiveInt, hexColor, dateString, mealType)
    recipes.schema.js — Recipe create/update schemas
    meals.schema.js   — Meal plan schemas
    ingredients.schema.js — Ingredient schemas
    tags.schema.js    — Tag schemas
    households.schema.js — Household schemas
    festivals.schema.js — Festival schemas
    polls.schema.js   — Poll schemas
    pantry.schema.js  — Pantry schemas
    templates.schema.js — Template schemas
    recurrence.schema.js — Recurrence rule schemas
    ai.schema.js      — AI config schemas
  services/
    audit.js          — Audit logging with rotation (90-day retention)
    ai.js             — AI integration (BYOK: OpenAI/Anthropic)
    thali.js          — Thali composition rules & completeness scoring
    dietary-rules.js  — Jain, Sattvic, Swaminarayan diet engines
    unit-converter.js — Indian → metric unit conversions (katori, chammach, glass)
  middleware/
    auth.js           — Session-based authentication guard (requireAuth, optionalAuth)
    csrf.js           — CSRF token middleware
    errors.js         — Global error handler (AppError + legacy compat)
    validate.js       — Zod validation middleware + legacy validators
    request-logger.js — HTTP request logging (method, path, status, duration, userId, requestId, IP)
    per-user-rate-limit.js — Sliding-window per-user rate limiting
```

**Frontend:**
```
public/
  index.html          — SPA shell with bottom nav, modals, ARIA landmarks
  app.js              — Main SPA: all views, routing, state, gestures, accessibility
  styles.css          — Midnight dark theme, responsive, WCAG AA contrast, skeleton states
  sw.js               — Service Worker: network-first caching
  login.html          — Auth login/register page
  manifest.json       — PWA manifest
  js/
    api.js            — API client with CSRF, auth redirect, error handling
    utils.js          — Pure utilities (esc, fmtTime, fmtDate, mealIcon, etc.)
```

**Stack:** Node.js 22, Express 5, better-sqlite3 (WAL mode, foreign keys ON), bcryptjs, helmet, cors, compression, dotenv, pino, zod, multer, ws, vanilla JS, Inter font, Material Icons Round

**No build step.** Edit files, restart server (`node src/server.js`), hard-refresh browser (`Ctrl+Shift+R`).

## Database Schema (45 tables including FTS)

### Auth (3 tables — inline)
```
users          (id, email, password_hash, display_name, household_id→households, created_at, last_login)
sessions       (sid PK, user_id→users, remember, expires_at, created_at)
login_attempts (email PK, attempts, first_attempt_at, locked_until)
```

### Core (5 tables — inline)
```
ingredients        (id, user_id→users, name, category, calories, protein, carbs, fat, fiber, unit, created_at, updated_at) — UNIQUE(user_id, name)
recipes            (id, user_id→users, name, description, servings, prep_time, cook_time, cuisine, difficulty, image_url, source_url, notes, is_favorite, position, region, is_system, meal_suitability, cooking_method, category, is_archived, created_at, updated_at)
recipe_ingredients (id, recipe_id→recipes, ingredient_id→ingredients, quantity, unit, notes, position)
tags               (id, user_id→users, name, color) — UNIQUE(user_id, name)
recipe_tags        (recipe_id→recipes, tag_id→tags) — M:N join
```

### Meal Planning (4 tables — inline + migrations)
```
meal_plans         (id, user_id→users, date, meal_type, notes, created_at, updated_at) — UNIQUE(user_id, date, meal_type)
meal_plan_items    (id, meal_plan_id→meal_plans, recipe_id→recipes[SET NULL], custom_name, servings, position)
meal_templates     (id, user_id→users, name, description, created_at)
meal_template_items(id, template_id→meal_templates, day_offset, meal_type, recipe_id→recipes, custom_name, servings, position)
```

### Shopping (2 tables — inline)
```
shopping_lists      (id, user_id→users, name, date_from, date_to, completed_at, created_at, updated_at)
shopping_list_items (id, list_id→shopping_lists, ingredient_id→ingredients[SET NULL], name, quantity, unit, category, checked, position)
```

### Nutrition (3 tables — inline + migration)
```
nutrition_log      (id, user_id→users, date, meal_type, recipe_id→recipes[SET NULL], custom_name, servings, calories, protein, carbs, fat, created_at)
nutrition_goals    (id, user_id→users, calories_target, protein_target, carbs_target, fat_target) — UNIQUE(user_id)
nutrition_alerts   (id, user_id→users, alert_type, metric, threshold, direction, enabled, created_at)
```

### Household & Family (5 tables — migrations 001–005)
```
households         (id, name, created_by→users, created_at)
persons            (id, household_id→households, name, dietary_type, spice_level, sugar_level, age_group, role, created_at)
person_assignments (id, meal_plan_item_id→meal_plan_items, person_id→persons, servings, spice_override, sugar_override, notes)
invite_codes       (id, code UNIQUE, household_id→households, created_by→users, expires_at, used_by, used_at, created_at)
person_festivals   (person_id→persons, festival_id→festivals) — M:N join
```

### Festivals & Fasting (3 tables — migration 009)
```
festivals          (id, name UNIQUE, type, region, date_rule JSON, duration_days, is_fasting, description, fasting_type)
fasting_rules      (id, festival_id→festivals, rule_type, category, ingredient_name, notes, region)
festival_recipes   (festival_id→festivals, recipe_id→recipes) — M:N join
```

### Polls & Voting (3 tables — migration 010)
```
polls              (id, household_id→households, created_by→users, question, target_date, target_meal_type, status, created_at)
poll_options       (id, poll_id→polls, recipe_id→recipes, custom_name, position)
poll_votes         (id, option_id→poll_options, user_id→users, created_at) — UNIQUE(option_id, user_id)
```

### Pantry & Purchases (2 tables — migrations 013–014)
```
pantry             (id, household_id→households, name, quantity, unit, category, location, expires_at, created_at, updated_at)
purchase_history   (id, household_id→households, ingredient_id→ingredients, name, quantity, unit, price, store, purchased_at)
```

### Recurrence & Notifications (3 tables — migrations 017–018)
```
recurrence_rules       (id, meal_plan_id→meal_plans, frequency, interval, days_of_week, end_date, created_at)
notifications          (id, user_id→users, type, title, body, data JSON, read, created_at)
notification_preferences (user_id→users, type, enabled) — PK(user_id, type)
```

### AI & Advanced (4 tables — migrations 019–020, 024, 026)
```
ai_config          (id, user_id→users, provider, api_key_encrypted, model, created_at, updated_at) — UNIQUE(user_id)
meal_ratings       (id, meal_plan_item_id→meal_plan_items, user_id→users, rating 1–5, comment, created_at) — UNIQUE(meal_plan_item_id, user_id)
recipe_versions    (id, recipe_id→recipes, version_number, data JSON, changed_by→users, created_at)
meal_slot_overrides(id, user_id→users, person_id→persons, override_type, start_date, end_date, slot_config JSON, created_at)
```

### Full-Text Search (5 virtual tables — migration 008)
```
recipes_fts, recipes_fts_data, recipes_fts_idx, recipes_fts_docsize, recipes_fts_config
```

### System (3 tables)
```
settings           (user_id, key, value) — PK(user_id, key)
audit_log          (id, user_id→users[SET NULL], action, resource, resource_id, ip, ua, detail, created_at)
_migrations        (id, name UNIQUE, applied_at)
```

All foreign keys use `ON DELETE CASCADE` except: `audit_log.user_id` (SET NULL), `meal_plan_items.recipe_id` (SET NULL), `shopping_list_items.ingredient_id` (SET NULL), `nutrition_log.recipe_id` (SET NULL).

## API Routes (144 routes across 24 modules)

| Module | Routes | Covers |
|--------|--------|--------|
| `recipes.js` | 18 | CRUD, search (FTS), filter, reorder, favorite, clone, scale, soft-delete, versions, daily suggestion |
| `meals.js` | 16 | Meal plan CRUD, items, copy, bulk ops, recurrence, leftovers, templates, thali completeness |
| `shopping.js` | 12 | Shopping lists CRUD, generate from plans, toggle items, pantry subtract, deep links, share |
| `nutrition.js` | 11 | Log, delete, goals CRUD, daily/weekly summary, person nutrition, household analytics, alerts |
| `festivals.js` | 8 | List, upcoming, detail, recipes, compliance, Ekadashi, regional variants |
| `ingredients.js` | 6 | CRUD, bulk create, filter, alias search, seasonal filter |
| `auth.js` | 6 | Register, login, logout, session, change-password, delete account |
| `households.js` | 6 | Create, get, update, invite codes, join, person count |
| `persons.js` | 6 | CRUD, festival selection, spice/sugar profiles |
| `polls.js` | 6 | CRUD, vote, close, apply to meal plan |
| `stats.js` | 6 | Dashboard, nutrition trends, top ingredients, top recipes, variety, ingredient usage |
| `templates.js` | 5 | Meal templates CRUD, apply to week |
| `pantry.js` | 5 | CRUD, expiry tracking |
| `ai.js` | 4 | Config CRUD, suggestion endpoints |
| `cost.js` | 4 | Cost estimation, trend reports |
| `notifications.js` | 4 | Preferences CRUD, notification list |
| `seed.js` | 4 | Seed ingredients, recipes, festivals, sample plans |
| `tags.js` | 4 | CRUD with recipe counts |
| `calendar.js` | 3 | Calendar view, iCal export |
| `ratings.js` | 3 | Meal ratings CRUD |
| `data.js` | 2 | Export (JSON/CSV), backup |
| `purchases.js` | 2 | Purchase history |
| `units.js` | 2 | Indian unit conversions |
| `import.js` | 1 | Recipe import from URL |

Additional non-route endpoints: `GET /api/health`, `GET /api/health/metrics`, `GET /api/docs` (OpenAPI), `POST /api/admin/audit/rotate`, `GET /health`, `GET /ready`

## Frontend Views (10+)

| View | Description |
|------|-------------|
| Today | Today's meals + nutrition progress bars + "What's for today?" + recipe of the day |
| Planner | Weekly meal planner (7-day grid, 6 slots) with swipe navigation |
| Recipes | Recipe grid with search (FTS), filter drawer, tag chips, detail bottom sheet |
| Ingredients | Ingredient list by category with macros, alias search, seasonal indicators |
| Shopping | Shopping lists with item toggling, completion celebration, pull-to-refresh |
| Nutrition | Nutrition tracker with daily summary, trend chart (Canvas), goals |
| Dashboard | Stats: recipes, ingredients, favorites, weekly plans, top cuisines, variety score |
| Pantry | Pantry inventory with expiry alerts, category grouping |
| Polls | Family meal voting with real-time results |
| Settings | Multi-tab: Profile, Family (household), Festivals, Notifications, AI config |

## Features Inventory

### Core
- Multi-user authentication (bcrypt, sessions, CSRF)
- Login attempt tracking with account lockout (5 attempts → 15min lock)
- Recipe management with ingredients, tags, nutrition auto-calculation
- Recipe soft-delete (archive/restore) and version history
- Ingredient database with nutrition per 100g, aliases, seasonal flags
- Meal planning (6 meal slots per day: breakfast, morning snack, lunch, evening snack, dinner, snack)
- Auto-generated shopping lists from meal plan date ranges
- Nutrition logging with auto-calculation from recipes
- Daily nutrition goals with progress tracking and alerts
- Data export (JSON + CSV), backup with retention policy

### Indian Cuisine Domain
- 6+ regional recipe collections (Gujarati, Bengali, Maharashtrian, Rajasthani, Hyderabadi, Goan)
- 15+ street food / chaat recipes
- Thali composition rules with completeness scoring
- Seasonal ingredient awareness
- Cooking method classification (tadka, dum, bhunao, etc.)
- Festival calendar with fasting rules (Ekadashi, Navratri, Ramadan, etc.)
- Regional festival variations
- Jain, Sattvic, Swaminarayan dietary rule engines
- Hindi/regional name aliases for ingredient search
- Indian unit conversions (katori, chammach, glass → metric)
- Condiment portion halving (pickle/achaar/chutney)

### Family & Social
- Household management with invite codes
- Person profiles with dietary type, spice/sugar levels, age group
- Per-person dish customization within group meals
- Poll-based family meal decisions
- Meal ratings (1–5 stars)
- Meal plan notes

### Smart Features
- Full-text search on recipes (FTS5)
- Pantry management with expiry tracking
- Meal templates (save/apply weekly plans)
- Recipe of the day suggestion
- Cost estimation and trend reports
- iCal export for meal plans
- Recipe import from URL
- Recurring meal plans
- AI integration (BYOK: OpenAI/Anthropic)
- WebSocket notifications for household broadcast

### UX & Accessibility
- Midnight dark theme with responsive design
- PWA manifest for add-to-homescreen
- Service worker with network-first caching
- Mobile bottom navigation (5 icons)
- Touch-friendly 44×44px targets
- Swipe gestures, pull-to-refresh
- WCAG AA color contrast compliance
- ARIA labels, roles, live regions
- Keyboard navigation with focus trapping
- Screen reader meal summaries
- Skeleton loading states
- Optimistic UI for toggles
- Inline form validation
- Meal slot color coding (6 colors)

### DevOps
- GitHub Actions CI (lint, test, coverage, npm audit)
- Docker multi-stage build with production profile
- Automated database backup with retention
- Structured request logging (method, path, status, duration, userId, requestId)
- Health checks with DB monitoring and error rate tracking
- Graceful shutdown with connection draining
- Environment validation on startup

## Key Patterns

- `enrichRecipe(r)` — decorates recipe with `ingredients[]`, `tags[]`, `nutrition{}`
- `calcRecipeNutrition(r)` — sums ingredient nutrition ÷ servings
- `esc(s)` — HTML entity escaping for user content
- `getNextPosition(table, where, params)` — auto-increment position for ordering
- All state is top-level `let` variables: `recipes`, `ingredients`, `tags`, `currentView`
- Full DOM re-render on state change via `render()` → view-specific async functions
- Express 5 wildcard: `app.get('/{*splat}', ...)` for SPA fallback
- Session-based auth: `requireAuth` middleware on all `/api/*` routes
- Consistent error format: `{ error: "message", code: "ERROR_CODE", details: [...] }`
- Pagination: `?page=1&limit=20` with `{ data, pagination: { page, limit, total, totalPages } }`
- Sort/order: `?sort=name&order=asc` on list endpoints

## Testing

```bash
npm test                    # Run all 559 tests
npm run test:coverage       # With c8 coverage reporting
npm run test:security       # Security-focused tests
npm run test:crud           # Core CRUD tests
npm run test:smoke          # E2E smoke tests
npm run lint                # ESLint checks
npm run audit               # npm audit (high severity)
```

**Runner:** `node --test --test-force-exit` with `node:assert/strict` + `supertest`

**39 test files:**

| File | Description |
|------|-------------|
| auth.test.js | Registration, login, session, logout, password change |
| recipes.test.js | Recipe CRUD, search, filter, tags, nutrition |
| ingredients.test.js | Ingredient CRUD, bulk create, filter |
| meals.test.js | Meal plan CRUD, items, daily view |
| shopping.test.js | Shopping list CRUD, generate from plans |
| nutrition.test.js | Nutrition log, goals, daily summary |
| households.test.js | Household CRUD, invites |
| persons.test.js | Person CRUD, profiles |
| person-assignments.test.js | Per-person meal assignments |
| festivals.test.js | Festival CRUD, fasting rules |
| person-festivals.test.js | Person-festival linking |
| fasting.test.js | Fasting compliance |
| polls.test.js | Poll voting, close, apply |
| templates.test.js | Meal templates |
| pantry.test.js | Pantry CRUD, expiry |
| purchases.test.js | Purchase history |
| notifications.test.js | Notification prefs |
| recurrence.test.js | Recurring meals |
| calendar.test.js | Calendar, iCal |
| ai.test.js | AI config |
| cost.test.js | Cost estimation |
| search.test.js | Full-text search |
| seed.test.js | Seed data |
| import.test.js | Recipe import |
| scaling.test.js | Recipe scaling |
| shopping-advanced.test.js | Advanced shopping features |
| nutrition-advanced.test.js | Advanced nutrition features |
| leftovers.test.js | Leftover tracking |
| batch1-security.test.js | Security foundations |
| batch2-security.test.js | Auth & security hardening |
| batch2-api.test.js | API quality & performance |
| batch3-devops.test.js | DevOps & CI/CD |
| batch4-data-model.test.js | Data model improvements |
| batch5-indian-cuisine.test.js | Indian cuisine domain |
| batch6-frontend.test.js | Frontend views |
| batch7-ux.test.js | UX & accessibility |
| batch8-qa.test.js | Comprehensive QA |
| batch9-advanced.test.js | Advanced features |
| batch10-integration.test.js | Project integrity |

**Isolation:** Each test file uses temp DB via `DB_DIR` env var, `cleanDb()` in `beforeEach`, factories: `makeRecipe()`, `makeIngredient()`, `makeTag()`, `linkTag()`, `addRecipeIngredient()`, `makeMealPlan()`, `makeMealPlanItem()`, `makeShoppingList()`, `makeUser2()`, `makeHousehold()`, `makePerson()`, `assignPersonToItem()`, `makeFestival()`, `addFastingRule()`, `makePoll()`, `addPollOption()`, `makePantryItem()`.

## Documentation Update Requirements

**After every code change, update these docs as applicable:**

| Change Type | Must Update |
|-------------|------------|
| New/changed API endpoint | CLAUDE.md § API Routes |
| New DB table or column | CLAUDE.md § Database Schema |
| New frontend view | CLAUDE.md § Frontend Views |
| New feature shipped | CLAUDE.md § Features Inventory, CHANGELOG.md |
| New test file or 20+ tests added | CLAUDE.md § Testing metrics |
| Architecture change | CLAUDE.md § Architecture |
| Breaking change | CHANGELOG.md with migration notes |
| Version bump | CLAUDE.md header, `package.json` |

## Migrations (36 files)

| # | File | Purpose |
|---|------|---------|
| 001 | households | Households table, user.household_id |
| 002 | persons | Person profiles with dietary/spice/sugar |
| 003 | person_assignments | Per-person meal assignments |
| 004 | expand_meal_slots | 6 meal types (breakfast → snack) |
| 005 | invite_codes | Household invite codes |
| 006 | expand_nutrition_meal_types | Nutrition log meal types |
| 007 | recipe_region | Region column on recipes |
| 008 | fts_recipes | Full-text search (FTS5) |
| 009 | festivals | Festivals, fasting rules, festival recipes |
| 010 | polls | Polls, options, votes |
| 011 | leftovers | Leftover tracking columns |
| 012 | templates | Meal templates |
| 013 | pantry | Pantry management |
| 014 | purchase_history | Purchase tracking |
| 015 | micronutrients | Extended nutrition fields |
| 016 | nutrition_alerts | Nutrition alert rules |
| 017 | recurrence | Recurring meal rules |
| 018 | notifications | Notification system |
| 019 | ai_config | AI BYOK configuration |
| 020 | ingredient_prices | Price tracking on ingredients |
| 021 | indexes | 6 performance indexes |
| 022 | updated-at | updated_at columns + triggers |
| 023 | household-role | Role column on households |
| 024 | meal-ratings | Meal rating system |
| 025 | soft-delete-recipes | is_archived column |
| 026 | recipe-versions | Version history (data JSON) |
| 027 | shopping-completion | completed_at on shopping lists |
| 028 | meal-plan-notes | Notes on meal plans |
| 029 | meal-suitability | meal_suitability JSON on recipes |
| 030 | seasonal-ingredients | Season flags on ingredients |
| 031 | cooking-method | cooking_method on recipes |
| 032 | festival-region | Region on fasting rules |
| 033 | root-vegetable-flag | is_root_vegetable on ingredients |
| 034 | meal-slot-overrides | Custom meal slot timings |
| 035 | ingredient-aliases | Hindi/regional name aliases |
| 036 | recipe-category | Category column on recipes |

## Rules

- ALWAYS read a file before editing it
- ALWAYS update documentation after code changes (see Documentation Update Requirements)
- After changing backend files, restart: `pkill -f "node src/server" && node src/server.js &`
- After changing frontend files, hard-refresh browser (`Ctrl+Shift+R`)
- Express route order matters: static routes MUST come before parameterized routes
- SQLite WAL files (`.db-shm`, `.db-wal`) and `backups/` are gitignored
- No build step, no bundler, no framework — edit and reload
- `position` column exists on recipes, recipe_ingredients, meal_plan_items, shopping_list_items for ordering
- Nutrition stored per 100g for ingredients, calculated per serving for recipes
- All API routes require authentication (session-based) except `/api/auth/*`, `/api/health`, `/health`, `/ready`
- All write endpoints validate input via Zod schemas
- Error responses follow `{ error, code, details }` format
- Pagination follows `{ data, pagination: { page, limit, total, totalPages } }` format
- Run `npm test` after every change to ensure no regressions
