# MealFlow — Claude Code Configuration

> **Last updated:** 5 April 2026 · **Version:** 0.9.0
> **Metrics:** 206 tests | 28 test files | 116 API routes | 36 DB tables + FTS | ~13,000 LOC

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
npm test                    # tests via node:test
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
| `RATE_LIMIT_MAX` | `200` | Max requests per window |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Graceful shutdown timeout |

See `.env.example` for all variables.

## Architecture

**Backend:**
```
src/
  server.js           — Express app entry, middleware, graceful shutdown
  config.js           — Centralized config (dotenv, Object.freeze)
  logger.js           — Pino structured logging
  errors.js           — AppError classes (NotFoundError, ValidationError, etc.)
  helpers.js          — Shared utilities (enrichRecipe, calcRecipeNutrition, etc.)
  db/
    index.js          — SQLite schema, 13 tables, inline migrations, startup integrity check
    migrate.js        — SQL migration runner (_migrations table)
    migrations/       — Versioned SQL migration files
  routes/
    auth.js           — Register, login, logout, session, change-password (5 routes)
    recipes.js        — Recipes CRUD, search, filter, reorder, favorite (7 routes)
    ingredients.js    — Ingredients CRUD, bulk create (6 routes)
    meals.js          — Meal plans CRUD, items, copy (7 routes)
    tags.js           — Tags CRUD with recipe counts (4 routes)
    nutrition.js      — Nutrition log, goals, daily summary (6 routes)
    shopping.js       — Shopping lists CRUD, generate from meal plans (7 routes)
    stats.js          — Dashboard, nutrition trends, ingredient usage (3 routes)
    data.js           — Export, backup (2 routes)
  schemas/            — Zod validation schemas
    common.schema.js  — Shared validators (positiveInt, hexColor, dateString, mealType)
    recipes.schema.js — Recipe create/update schemas
    meals.schema.js   — Meal plan schemas
    ingredients.schema.js — Ingredient schemas
    tags.schema.js    — Tag schemas
  services/
    audit.js          — Audit logging
  middleware/
    auth.js           — Session-based authentication guard
    csrf.js           — CSRF token middleware
    errors.js         — Global error handler (AppError + legacy compat)
    validate.js       — Zod validation middleware + legacy validators
    request-logger.js — HTTP request logging
```

**Frontend:**
```
public/
  app.js              — Main SPA: all views, routing, state management
  styles.css          — All styles, responsive, midnight theme
  index.html          — SPA shell, sidebar, modals
  sw.js               — Service Worker: network-first caching
  login.html          — Auth login/register page
  manifest.json       — PWA manifest
  js/
    api.js            — API client with CSRF, auth redirect, error handling
    utils.js          — Pure utilities (esc, fmtTime, fmtDate, mealIcon, etc.)
```

**Stack:** Node.js 22, Express 5, better-sqlite3 (WAL mode, foreign keys ON), bcryptjs, helmet, cors, dotenv, pino, zod, vanilla JS, Inter font, Material Icons Round

**No build step.** Edit files, restart server (`node src/server.js`), hard-refresh browser (`Ctrl+Shift+R`).

## Database Schema (13 tables)

### Auth
```
users          (id, email, password_hash, display_name, created_at, last_login)
sessions       (sid PK, user_id→users, remember, expires_at, created_at)
login_attempts (email PK, attempts, first_attempt_at, locked_until)
```

### Core
```
ingredients        (id, user_id→users, name, category, calories, protein, carbs, fat, fiber, unit, created_at) — UNIQUE(user_id, name)
recipes            (id, user_id→users, name, description, servings, prep_time, cook_time, cuisine, difficulty, image_url, source_url, notes, is_favorite, position, created_at, updated_at)
recipe_ingredients (id, recipe_id→recipes, ingredient_id→ingredients, quantity, unit, notes, position)
tags               (id, user_id→users, name, color) — UNIQUE(user_id, name)
recipe_tags        (recipe_id→recipes, tag_id→tags) — M:N join
```

### Meal Planning
```
meal_plans         (id, user_id→users, date, meal_type, created_at) — UNIQUE(user_id, date, meal_type)
meal_plan_items    (id, meal_plan_id→meal_plans, recipe_id→recipes[SET NULL], custom_name, servings, position)
```

### Shopping
```
shopping_lists      (id, user_id→users, name, date_from, date_to, created_at)
shopping_list_items (id, list_id→shopping_lists, ingredient_id→ingredients[SET NULL], name, quantity, unit, category, checked, position)
```

### Nutrition
```
nutrition_log      (id, user_id→users, date, meal_type, recipe_id→recipes[SET NULL], custom_name, servings, calories, protein, carbs, fat, created_at)
nutrition_goals    (id, user_id→users, calories_target, protein_target, carbs_target, fat_target) — UNIQUE(user_id)
```

### System
```
settings           (user_id, key, value) — PK(user_id, key)
audit_log          (id, user_id→users[SET NULL], action, resource, resource_id, ip, ua, detail, created_at)
_migrations        (id, name UNIQUE, applied_at)
```

All foreign keys use `ON DELETE CASCADE` except: `audit_log.user_id` (SET NULL), `meal_plan_items.recipe_id` (SET NULL), `shopping_list_items.ingredient_id` (SET NULL), `nutrition_log.recipe_id` (SET NULL).

## API Routes (~47 routes across 9 modules)

| Module | Routes | Covers |
|--------|--------|--------|
| `recipes.js` | 7 | CRUD, search, filter, reorder, favorite toggle |
| `meals.js` | 7 | Meal plan CRUD, items, copy to date |
| `shopping.js` | 7 | Shopping lists CRUD, generate from meal plans, toggle items |
| `nutrition.js` | 6 | Log, delete, goals CRUD, daily summary |
| `ingredients.js` | 6 | CRUD, bulk create, filter |
| `auth.js` | 5 | Register, login, logout, session, change-password |
| `tags.js` | 4 | CRUD with recipe counts |
| `stats.js` | 3 | Dashboard, nutrition trends, top ingredients |
| `data.js` | 2 | Export, backup |

## Frontend Views (8)

| View | Description |
|------|-------------|
| Today | Today's meals + nutrition progress bars + add items |
| Planner | Weekly meal planner (stub) |
| Recipes | Recipe grid with search, filter, detail modal |
| Ingredients | Ingredient list by category with macros |
| Shopping | Shopping lists with item toggling |
| Nutrition | Nutrition tracker with daily summary |
| Dashboard | Stats: recipes, ingredients, favorites, weekly plans, top cuisines |
| Settings | User settings (stub) |

## Features Inventory

### Core
- Multi-user authentication (bcrypt, sessions, CSRF)
- Login attempt tracking with account lockout (5 attempts → 15min lock)
- Recipe management with ingredients, tags, nutrition auto-calculation
- Ingredient database with nutrition per 100g
- Meal planning (breakfast/lunch/dinner/snack per day)
- Auto-generated shopping lists from meal plan date ranges
- Nutrition logging with auto-calculation from recipes
- Daily nutrition goals with progress tracking
- Data export (full JSON backup)

### UX
- Midnight dark theme with responsive design
- PWA manifest for add-to-homescreen
- Service worker with network-first caching
- Toast notifications
- Modal system for recipe detail/edit
- Sidebar navigation with collapse
- Search and filter on recipes/ingredients

## Key Patterns

- `enrichRecipe(r)` — decorates recipe with `ingredients[]`, `tags[]`, `nutrition{}`
- `calcRecipeNutrition(r)` — sums ingredient nutrition ÷ servings
- `esc(s)` — HTML entity escaping for user content
- `getNextPosition(table, where, params)` — auto-increment position for ordering
- All state is top-level `let` variables: `recipes`, `ingredients`, `tags`, `currentView`
- Full DOM re-render on state change via `render()` → view-specific async functions
- Express 5 wildcard: `app.get('/{*splat}', ...)` for SPA fallback
- Session-based auth: `requireAuth` middleware on all `/api/*` routes

## Testing

```bash
npm test                    # Run all tests
```

**Runner:** `node --test --test-force-exit` with `node:assert/strict` + `supertest`

**5 test files:**

| File | Description |
|------|-------------|
| auth.test.js | Registration, login, session, logout |
| recipes.test.js | Recipe CRUD, search, filter, tags, nutrition |
| ingredients.test.js | Ingredient CRUD, bulk create, filter |
| meals.test.js | Meal plan CRUD, items, daily view |
| shopping.test.js | Shopping list CRUD, generate from plans |

**Isolation:** Each test file uses temp DB via `DB_DIR` env var, `cleanDb()` in `beforeEach`, factories: `makeRecipe()`, `makeIngredient()`, `makeTag()`, `linkTag()`, `addRecipeIngredient()`, `makeMealPlan()`, `makeShoppingList()`.

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

## Roadmap

See `docs/design/implementation-plan.md` for the full 8-phase plan (v0.2.0 → v0.9.0).

| Phase | Version | Name | Key Deliverables | Test Target |
|-------|---------|------|------------------|-------------|
| 1 | v0.2.0 | The Foundation | Households, persons, 6 meal slots, per-person assignment, spice/sugar profiles | 64 |
| 2 | v0.3.0 | Indian Kitchen | 500+ Indian recipes, 1,000+ ingredients, regional cuisines, FTS, katori units | 86 |
| 3 | v0.4.0 | Festival Ready | Festival calendar, fasting rules, per-person fasting, auto-plan adjustment | 109 |
| 4 | v0.5.0 | Family Decisions | Polls & voting, leftover tracking, meal templates | 135 |
| 5 | v0.6.0 | Smart Shopping | Pantry management, smart aggregation, quick-commerce deep-links, WhatsApp share | 157 |
| 6 | v0.7.0 | Nourished | Per-person nutrition, micronutrients, weekly reports, dietary alerts | 171 |
| 7 | v0.8.0 | Full Experience | Recipe import, recurring meals, notifications, cook mode, calendar view | 197 |
| 8 | v0.9.0 | Intelligence | AI suggestions (BYOK), weekly plan gen, cost estimation | 209 |

**Final target:** 33 tables, 99 API routes, 209+ tests, 85%+ coverage

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
- All API routes require authentication (session-based) except `/api/auth/*`
