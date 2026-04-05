---
status: Draft
version: 0.1.0
date: 2026-04-05
---

# MealFlow — Implementation Plan

> Phased implementation from current generic scaffold → India-focused family meal planner.
> Each phase is a shippable increment. Tests precede features (TDD where practical).

**Reference:** [requirements.md](requirements.md)

---

## Current State (v0.1.0 — "Scaffold")

| Metric | Count |
|--------|-------|
| Tests | 34 |
| Test files | 5 |
| API routes | 47 |
| DB tables | 13 |
| LOC (est.) | ~2,500 |
| Frontend views | 8 |

**What exists:** Generic single-user meal planner with recipes, ingredients, 4 meal slots (breakfast/lunch/dinner/snack), shopping lists, nutrition logging, tags, auth, CSRF, export.

**What's missing for India MVP:** Households, persons, per-person assignment, 6 meal slots, multi-course meals, Indian recipe/ingredient seeding, spice profiles, festival calendar, polls, UI overhaul.

---

## Phase 1 — v0.2.0 "The Foundation" (Household & Persons)

> Transform single-user model into household-with-persons model. This is the most critical migration — everything else builds on it.

### Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 1.1 | Household creation | Create households table, auto-create on registration | Household setup wizard on first login | 6 |
| 1.2 | Person management (CRUD) | persons table, dietary_type, restrictions, age_group | "Family Members" settings panel | 8 |
| 1.3 | Spice & sugar profiles | spice_level, sugar_level on persons | Per-person profile card with sliders | 4 |
| 1.4 | 6 meal slots | Expand meal_type CHECK to 6 values | 6-slot day planner grid | 4 |
| 1.5 | Per-person dish assignment | person_assignments table linking meal_plan_items ↔ persons | Assign chips on each dish | 6 |
| 1.6 | Household invites | invite_codes table, join flow | "Invite Family" button + code entry | 5 |

### DB Migrations

```sql
-- 001_households.sql
CREATE TABLE households (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'My Family',
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN household_id INTEGER REFERENCES households(id) ON DELETE SET NULL;

-- 002_persons.sql
CREATE TABLE persons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '🙂',
  dietary_type TEXT DEFAULT 'vegetarian'
    CHECK(dietary_type IN ('vegetarian','non_vegetarian','eggetarian','vegan','jain','sattvic','swaminarayan')),
  restrictions TEXT DEFAULT '[]',          -- JSON array: ["nut-free","gluten-free","no-onion-garlic","diabetic-friendly"]
  age_group TEXT DEFAULT 'adult'
    CHECK(age_group IN ('toddler','child','teen','adult','senior')),
  spice_level INTEGER DEFAULT 3 CHECK(spice_level BETWEEN 1 AND 5),
  sugar_level INTEGER DEFAULT 3 CHECK(sugar_level BETWEEN 1 AND 5),
  calorie_target REAL,
  protein_target REAL,
  carbs_target REAL,
  fat_target REAL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 003_person_assignments.sql
CREATE TABLE person_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_plan_item_id INTEGER NOT NULL REFERENCES meal_plan_items(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  servings REAL DEFAULT 1,
  spice_override INTEGER CHECK(spice_override BETWEEN 1 AND 5),
  sugar_override INTEGER CHECK(sugar_override BETWEEN 1 AND 5),
  notes TEXT DEFAULT '',               -- "less oil", "extra piece"
  UNIQUE(meal_plan_item_id, person_id)
);

-- 004_expand_meal_slots.sql
-- Replace the meal_type CHECK constraint on meal_plans
-- SQLite doesn't support ALTER CHECK, so create new table + migrate data
CREATE TABLE meal_plans_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK(meal_type IN (
    'breakfast','morning_snack','lunch','evening_snack','dinner','custom'
  )),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date, meal_type)
);
INSERT INTO meal_plans_new SELECT * FROM meal_plans;
DROP TABLE meal_plans;
ALTER TABLE meal_plans_new RENAME TO meal_plans;

-- 005_invite_codes.sql
CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses INTEGER DEFAULT 5,
  uses INTEGER DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### New API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/households` | Create household (auto on register) |
| GET | `/api/households/current` | Get current household |
| PUT | `/api/households/current` | Update household name |
| GET | `/api/persons` | List persons in household |
| POST | `/api/persons` | Add person |
| PUT | `/api/persons/:id` | Update person |
| DELETE | `/api/persons/:id` | Remove person |
| POST | `/api/persons/:itemId/assign` | Assign person to meal plan item |
| DELETE | `/api/persons/:itemId/assign/:personId` | Unassign |
| POST | `/api/households/invite` | Generate invite code |
| POST | `/api/households/join` | Join household by code |

**Modified routes:** All existing meal plan routes updated to include person assignments in responses.

### Frontend Changes

- New "Family" section in settings → person cards with emoji, dietary type, sliders
- Meal planner grid: 6 columns (slots) × N rows (days)
- Each dish card shows assigned person chips (colored avatars)
- First login: "Set up your household" wizard (name → add persons)

### Test Targets

| File | Tests | Covers |
|------|-------|--------|
| `tests/households.test.js` | 8 | Create, read, update, invite, join, duplicate, invalid code, expired code |
| `tests/persons.test.js` | 10 | CRUD, dietary types, spice/sugar bounds, restrictions JSON, age groups |
| `tests/person-assignments.test.js` | 8 | Assign, unassign, overrides, notes, cascade delete, duplicate, invalid person |
| `tests/meals.test.js` (update) | +4 | 6 meal slots, person assignment in responses, meal copy with assignments |

**Phase 1 test total: 34 (existing) + 30 = 64**

### Test Helpers Additions

```js
// tests/helpers.js additions
function makeHousehold(db, userId, name = 'Test Family') { ... }
function makePerson(db, householdId, overrides = {}) { ... }
function assignPerson(db, itemId, personId, overrides = {}) { ... }
function makeInviteCode(db, householdId, userId) { ... }
```

---

## Phase 2 — v0.3.0 "Indian Kitchen" (Recipe & Ingredient Database)

> Populate the Indian culinary knowledge base. Without this, the app is an empty shell.

### Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 2.1 | Indian ingredient database | Seed script with 1,000+ ingredients (IFCT data) | Ingredient browser with categories | 4 |
| 2.2 | Indian recipe database | Seed 500+ curated recipes across 8 regional cuisines | Recipe browser with cuisine filter | 6 |
| 2.3 | Regional cuisine tagging | region column on recipes, auto-tags | Cuisine filter tabs (Punjabi, South Indian, Gujarati, Bengali, etc.) | 3 |
| 2.4 | Recipe scaling | Scale ingredient quantities by serving count | Slider/input to adjust servings in recipe view | 4 |
| 2.5 | Katori measurements | Alternative measurement units (katori, chamach, glass, chutki) | Unit toggle in recipe & ingredient views | 3 |
| 2.6 | Recipe search improvements | Full-text search across name, cuisine, tags, ingredients | Enhanced search bar with autocomplete | 4 |

### DB Migrations

```sql
-- 006_recipe_region.sql
ALTER TABLE recipes ADD COLUMN region TEXT DEFAULT '';
-- Values: 'punjabi','south_indian','gujarati','bengali','rajasthani',
--         'maharashtrian','kerala','hyderabadi','goan','mughlai','street_food','pan_indian'

ALTER TABLE recipes ADD COLUMN is_system INTEGER DEFAULT 0;
-- System recipes are read-only defaults; users can clone to customize

ALTER TABLE ingredients ADD COLUMN is_system INTEGER DEFAULT 0;
-- System ingredients are the seeded Indian database

ALTER TABLE ingredients ADD COLUMN alt_unit TEXT DEFAULT '';
ALTER TABLE ingredients ADD COLUMN alt_quantity REAL DEFAULT 0;
-- For katori/chamach conversions

-- 007_fts_recipes.sql
CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
  name, description, cuisine, region, notes,
  content='recipes', content_rowid='id'
);
-- Triggers to keep FTS in sync
CREATE TRIGGER recipes_ai AFTER INSERT ON recipes BEGIN
  INSERT INTO recipes_fts(rowid, name, description, cuisine, region, notes)
  VALUES (new.id, new.name, new.description, new.cuisine, new.region, new.notes);
END;
CREATE TRIGGER recipes_ad AFTER DELETE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, name, description, cuisine, region, notes)
  VALUES('delete', old.id, old.name, old.description, old.cuisine, old.region, old.notes);
END;
CREATE TRIGGER recipes_au AFTER UPDATE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, name, description, cuisine, region, notes)
  VALUES('delete', old.id, old.name, old.description, old.cuisine, old.region, old.notes);
  INSERT INTO recipes_fts(rowid, name, description, cuisine, region, notes)
  VALUES (new.id, new.name, new.description, new.cuisine, new.region, new.notes);
END;
```

### Seed Scripts

```
scripts/
  seed-ingredients.js     — 1,000+ Indian ingredients with nutrition (JSON → SQLite)
  seed-recipes.js         — 500+ curated recipes with ingredients, tags, regions
data/
  ingredients.json        — Master ingredient database
  recipes/
    punjabi.json          — 60+ Punjabi recipes
    south-indian.json     — 80+ South Indian recipes
    gujarati.json         — 50+ Gujarati recipes
    bengali.json          — 40+ Bengali recipes
    maharashtrian.json    — 40+ Maharashtrian recipes
    street-food.json      — 30+ street food recipes
    pan-indian.json       — 100+ common recipes
    snacks-sweets.json    — 50+ snacks & mithai
    beverages.json        — 20+ chai/lassi/buttermilk
    breads.json           — 30+ roti/naan/paratha/puri
```

### New API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/recipes/search` | FTS search with filters (region, dietary, time, difficulty) |
| GET | `/api/recipes/regions` | List available regions with counts |
| POST | `/api/recipes/:id/clone` | Clone system recipe to user's collection |
| GET | `/api/recipes/:id/scaled/:servings` | Get recipe with quantities scaled |
| GET | `/api/ingredients/categories` | List ingredient categories with counts |
| POST | `/api/seed/ingredients` | Admin: run ingredient seeding |
| POST | `/api/seed/recipes` | Admin: run recipe seeding |

### Test Targets

| File | Tests | Covers |
|------|-------|--------|
| `tests/seed.test.js` | 6 | Ingredient seed loads, recipe seed loads, no duplicates, nutrition present, region assigned, relationships intact |
| `tests/search.test.js` | 8 | FTS ranking, cuisine filter, dietary filter, multi-word, partial match, empty results, special chars, combined filters |
| `tests/scaling.test.js` | 5 | Scale up, scale down, fractional, zero, rounding |
| `tests/recipes.test.js` (update) | +3 | Region field, clone, system recipes read-only |

**Phase 2 test total: 64 + 22 = 86**

---

## Phase 3 — v0.4.0 "Festival Ready" (Cultural Calendar & Fasting)

> The single biggest differentiator. No competitor has this.

### Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 3.1 | Festival calendar engine | festivals table + rule engine for moveable dates | Calendar overlay showing upcoming festivals | 6 |
| 3.2 | Fasting rules per festival | fasting_rules table with ingredient allow/deny lists | "Fasting mode" toggle per person per festival | 6 |
| 3.3 | Festival meal suggestions | Auto-suggest festival-appropriate recipes | "Festival Specials" recipe filter | 4 |
| 3.4 | Per-person fasting tracking | person_fasting table linking persons to their observed festivals | Per-person fasting preferences in profile | 4 |
| 3.5 | Auto-plan adjustment | When fasting active, auto-swap non-compliant dishes | Warning badges on non-compliant items | 4 |
| 3.6 | Festival recipe collections | Curated recipe sets per festival | Festival detail page with recipes | 3 |

### DB Migrations

```sql
-- 008_festivals.sql
CREATE TABLE festivals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  name_hindi TEXT DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('hindu','muslim','christian','sikh','jain','buddhist','secular','regional')),
  region TEXT DEFAULT 'pan_india',         -- or specific state/region
  date_rule TEXT NOT NULL,                 -- JSON: { "type": "fixed", "month": 1, "day": 26 } or { "type": "lunar", "month": "chaitra", "tithi": "shukla_9" }
  duration_days INTEGER DEFAULT 1,
  description TEXT DEFAULT '',
  is_fasting INTEGER DEFAULT 0,
  fasting_type TEXT DEFAULT ''             -- 'full_day','sunrise_to_sunset','specific_foods'
);

CREATE TABLE fasting_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('allow','deny')),
  category TEXT,                           -- ingredient category
  ingredient_name TEXT,                    -- specific ingredient (optional)
  notes TEXT DEFAULT ''
);

CREATE TABLE person_festivals (
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  PRIMARY KEY(person_id, festival_id)
);

CREATE TABLE festival_recipes (
  festival_id INTEGER NOT NULL REFERENCES festivals(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  PRIMARY KEY(festival_id, recipe_id)
);
```

### Data Files

```
data/
  festivals/
    hindu.json            — Navratri, Diwali, Holi, Makar Sankranti, Ganesh Chaturthi, etc.
    muslim.json           — Ramadan, Eid al-Fitr, Eid al-Adha
    sikh.json             — Baisakhi, Gurpurab
    jain.json             — Paryushana, Mahavir Jayanti
    regional.json         — Onam, Pongal, Bihu, Lohri, Chhath
    secular.json          — Independence Day, Republic Day
  fasting-rules/
    navratri.json         — Allow: kuttu, sabudana, rajgira, fruits, dairy. Deny: grains, onion, garlic
    ekadashi.json         — Allow: fruits, nuts, milk. Deny: grains, beans
    ramadan.json          — Rules for suhoor/iftar timing
    shravan.json          — No meat, some households no onion/garlic
```

### New API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/festivals` | List all festivals (optional: month, type filter) |
| GET | `/api/festivals/upcoming` | Next 30 days of festivals |
| GET | `/api/festivals/:id` | Festival detail with fasting rules & recipes |
| GET | `/api/festivals/:id/recipes` | Recipes appropriate for festival |
| PUT | `/api/persons/:id/festivals` | Set which festivals a person observes |
| GET | `/api/meal-plans/:date/compliance` | Check if day's plan complies with active fasting |
| POST | `/api/meal-plans/:date/auto-adjust` | Auto-swap non-compliant dishes |

### Test Targets

| File | Tests | Covers |
|------|-------|--------|
| `tests/festivals.test.js` | 10 | List, filter by type, upcoming, detail, recipes, fasting rules, date calculations, regional filter, no duplicates, edge dates |
| `tests/fasting.test.js` | 8 | Compliance check (pass), compliance check (fail), auto-adjust, person-festival linking, multi-person fasting, allow rules, deny rules, combined rules |
| `tests/person-festivals.test.js` | 5 | Set festivals, update, unset, cascade delete person, festival recipes |

**Phase 3 test total: 86 + 23 = 109**

---

## Phase 4 — v0.5.0 "Family Decisions" (Polls & Collaboration)

> Transform individual planning into family collaboration.

### Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 4.1 | Meal polls | polls table, vote tracking, majority rules | Create poll UI + voting cards | 8 |
| 4.2 | Poll results & auto-apply | Winner auto-added to meal plan | Results view with vote counts | 4 |
| 4.3 | Special requests per dish | requests on person_assignments.notes | "Add note" button per person per dish | 3 |
| 4.4 | Leftover tracking | leftover_flag on meal_plan_items, reuse suggestions | "Mark as leftover" toggle, reuse prompt | 5 |
| 4.5 | Meal templates | meal_templates table, apply template flow | "Save as template" / "Use template" | 6 |

### DB Migrations

```sql
-- 009_polls.sql
CREATE TABLE polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,              -- "What for dinner Saturday?"
  target_date TEXT NOT NULL,
  target_meal_type TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','applied')),
  closes_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE poll_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  custom_name TEXT DEFAULT '',
  position INTEGER DEFAULT 0
);

CREATE TABLE poll_votes (
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(poll_id, user_id)
);

-- 010_leftovers.sql
ALTER TABLE meal_plan_items ADD COLUMN is_leftover INTEGER DEFAULT 0;
ALTER TABLE meal_plan_items ADD COLUMN leftover_from_item_id INTEGER REFERENCES meal_plan_items(id) ON DELETE SET NULL;

-- 011_templates.sql
CREATE TABLE meal_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration_days INTEGER DEFAULT 7,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE meal_template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  day_offset INTEGER NOT NULL,           -- 0 = first day, 6 = seventh day
  meal_type TEXT NOT NULL,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  custom_name TEXT DEFAULT '',
  person_ids TEXT DEFAULT '[]',          -- JSON array of person IDs to assign
  servings REAL DEFAULT 1,
  position INTEGER DEFAULT 0
);
```

### New API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/polls` | List polls for household |
| POST | `/api/polls` | Create poll with options |
| GET | `/api/polls/:id` | Poll detail with votes |
| POST | `/api/polls/:id/vote` | Cast vote |
| POST | `/api/polls/:id/close` | Close poll, determine winner |
| POST | `/api/polls/:id/apply` | Apply winner to meal plan |
| PUT | `/api/meal-items/:id/leftover` | Toggle leftover flag |
| GET | `/api/meal-items/leftovers` | Get available leftovers for reuse |
| POST | `/api/meal-items/:id/reuse` | Reuse leftover in new slot |
| GET | `/api/templates` | List templates |
| POST | `/api/templates` | Save current week as template |
| GET | `/api/templates/:id` | Template detail |
| POST | `/api/templates/:id/apply` | Apply template to date range |
| DELETE | `/api/templates/:id` | Delete template |

### Test Targets

| File | Tests | Covers |
|------|-------|--------|
| `tests/polls.test.js` | 12 | Create, add options, vote, change vote (rejected), close, apply winner, expired auto-close, no double vote, empty poll, results tally, delete, household scoping |
| `tests/leftovers.test.js` | 6 | Mark leftover, list leftovers, reuse, clear flag, cascade from original, leftover in shopping exclusion |
| `tests/templates.test.js` | 8 | Create from week, list, apply to dates, person assignment preservation, overlap handling, delete, duration validation, template detail |

**Phase 4 test total: 109 + 26 = 135**

---

## Phase 5 — v0.6.0 "Smart Shopping" (Grocery & Pantry)

> Close the loop: plan → shop → cook → repeat.

### Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 5.1 | Smart grocery aggregation | Merge quantities across recipes, deduplicate, categorize | Grouped shopping list by store section | 5 |
| 5.2 | Pantry management | pantry table with quantities, expiry tracking | Pantry view with categories | 6 |
| 5.3 | Pantry subtraction | Subtract in-stock from shopping lists | "Already have" badges on shopping items | 3 |
| 5.4 | Quick-commerce deep links | URL builders for Blinkit, Zepto, BigBasket, Swiggy Instamart | "Order on..." buttons with pre-filled search | 4 |
| 5.5 | Shopping list sharing | Copy to clipboard, WhatsApp share format | "Share" button with format options | 3 |
| 5.6 | Shopping history | Track purchase history for price estimates | Price trends per ingredient | 3 |

### DB Migrations

```sql
-- 012_pantry.sql
CREATE TABLE pantry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  category TEXT DEFAULT 'other',
  expires_at TEXT,                          -- date string, nullable
  location TEXT DEFAULT 'kitchen',         -- kitchen, fridge, freezer, store_room
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 013_purchase_history.sql
CREATE TABLE purchase_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  price REAL,
  store TEXT DEFAULT '',
  purchased_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### New API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pantry` | List pantry items |
| POST | `/api/pantry` | Add/update pantry item |
| PUT | `/api/pantry/:id` | Update quantity/expiry |
| DELETE | `/api/pantry/:id` | Remove from pantry |
| GET | `/api/pantry/expiring` | Items expiring within N days |
| POST | `/api/shopping/:id/subtract-pantry` | Subtract pantry from shopping list |
| GET | `/api/shopping/:id/deeplinks` | Generate quick-commerce URLs |
| GET | `/api/shopping/:id/share` | Formatted text for sharing |
| POST | `/api/purchases` | Log purchase |
| GET | `/api/purchases/prices` | Price history for ingredients |

### Test Targets

| File | Tests | Covers |
|------|-------|--------|
| `tests/pantry.test.js` | 8 | CRUD, expiry filter, location filter, quantity update, duplicate merge, household scoping, category grouping, cascade |
| `tests/shopping-advanced.test.js` | 10 | Aggregation across recipes, dedup, pantry subtraction, deep-link generation (Blinkit, Zepto, BigBasket, Swiggy), share format, category ordering, unit normalization, zero-quantity exclusion, date range, multi-person scaling |
| `tests/purchases.test.js` | 4 | Log purchase, price history, store tracking, household scoping |

**Phase 5 test total: 135 + 22 = 157**

---

## Phase 6 — v0.7.0 "Nourished" (Nutrition & Health)

> Per-person nutrition tracking with Indian food intelligence.

### Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 6.1 | Per-person nutrition tracking | Calculate nutrition per person from assignments | Per-person daily nutrition cards | 5 |
| 6.2 | Nutrition goals per person | Goals on persons table (already exists) | Goal bars in person profile | 3 |
| 6.3 | Weekly nutrition report | Aggregate weekly macros per person | Weekly dashboard with charts | 4 |
| 6.4 | Dietary alerts | Flag low/high nutrients against goals | Warning badges ("Low iron this week") | 4 |
| 6.5 | Micronutrient tracking | Extend nutrition to iron, calcium, vitamin_c, vitamin_a, sodium | Extended nutrition display | 3 |
| 6.6 | Recipe nutrition auto-calc | Enhance calcRecipeNutrition with micronutrients | Detailed nutrition panel on recipe view | 3 |

### DB Migrations

```sql
-- 014_micronutrients.sql
ALTER TABLE ingredients ADD COLUMN iron REAL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN calcium REAL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN vitamin_c REAL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN vitamin_a REAL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN sodium REAL DEFAULT 0;
ALTER TABLE ingredients ADD COLUMN potassium REAL DEFAULT 0;

ALTER TABLE nutrition_log ADD COLUMN person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL;
ALTER TABLE nutrition_log ADD COLUMN iron REAL DEFAULT 0;
ALTER TABLE nutrition_log ADD COLUMN calcium REAL DEFAULT 0;

-- 015_nutrition_alerts.sql
CREATE TABLE nutrition_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  nutrient TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('low','high')),
  period TEXT NOT NULL,                    -- 'daily' or 'weekly'
  value REAL NOT NULL,
  target REAL NOT NULL,
  date TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Test Targets

| File | Tests | Covers |
|------|-------|--------|
| `tests/nutrition-advanced.test.js` | 10 | Per-person calculation, multi-person aggregation, goal comparison, weekly summary, micronutrients, alerts generation, alert thresholds, person nutrition history, recipe auto-calc with micros, zero-assignment handling |
| `tests/nutrition.test.js` (update) | +4 | Micronutrient fields, person_id field, backward compat, alert cleanup |

**Phase 6 test total: 157 + 14 = 171**

---

## Phase 7 — v0.8.0 "Full Experience" (UX Polish & Remaining P1)

> Ship remaining P1 features and polish the UI.

### Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 7.1 | Recipe import (URL) | URL parser using regex + heuristics (no AI yet) | "Import from URL" button in recipe create | 5 |
| 7.2 | Repeat/recurring meals | recurrence_rules table, cron-like scheduling | "Repeat" toggle on meal items (daily, MWF, weekly, bi-weekly, monthly) | 6 |
| 7.3 | Notifications | In-app notifications table + scheduled checks | Notification bell, morning plan summary | 4 |
| 7.4 | Cook mode | Step-by-step recipe instructions view | Fullscreen view, step nav, timer buttons, keep-screen-on | 3 |
| 7.5 | Calendar view | Monthly calendar endpoint with summary data | Month view with color-coded meal dots | 4 |
| 7.6 | WhatsApp sharing | Format meal plan / shopping list for WhatsApp | "Share to WhatsApp" button (wa.me deep link) | 3 |
| 7.7 | Settings overhaul | User preferences, household settings, notification prefs | Full settings UI with sections | 4 |

### DB Migrations

```sql
-- 016_recurrence.sql
CREATE TABLE recurrence_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_plan_item_id INTEGER NOT NULL REFERENCES meal_plan_items(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL CHECK(pattern IN ('daily','specific_days','weekly','biweekly','monthly')),
  days_of_week TEXT DEFAULT '',            -- JSON: [1,3,5] for MWF
  start_date TEXT NOT NULL,
  end_date TEXT,                           -- NULL = indefinite
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 017_notifications.sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  action_url TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                      -- 'morning_plan','cooking_reminder','shopping_day','festival_upcoming'
  enabled INTEGER DEFAULT 1,
  time TEXT DEFAULT '07:00',              -- HH:MM for scheduled notifications
  PRIMARY KEY(user_id, type)
);
```

### Test Targets

| File | Tests | Covers |
|------|-------|--------|
| `tests/import.test.js` | 6 | Parse recipe URL (structured data, heuristic), invalid URL, duplicate detection, ingredient matching, instructions extraction |
| `tests/recurrence.test.js` | 8 | Daily repeat, specific days, weekly, biweekly, monthly, date range expansion, indefinite end, edit single occurrence |
| `tests/notifications.test.js` | 5 | Create, mark read, list unread, preferences CRUD, scheduled generation |
| `tests/calendar.test.js` | 4 | Month summary, color coding, navigate months, festival overlay |
| `tests/sharing.test.js` | 3 | WhatsApp format, copy-to-clipboard format, meal plan format |

**Phase 7 test total: 171 + 26 = 197**

---

## Phase 8 — v0.9.0 "Intelligence" (AI Features — Optional)

> AI features are opt-in, BYOK (Bring Your Own Key). The app works fully without them.

### Features

| # | Feature | Backend | Frontend | Tests |
|---|---------|---------|----------|-------|
| 8.1 | AI meal suggestions | LLM integration (configurable provider) | "Suggest a meal" button with context | 4 |
| 8.2 | AI weekly plan generation | Full week plan generation respecting all constraints | "Generate week" button | 4 |
| 8.3 | AI recipe generation | Generate new recipe from available ingredients | "Create recipe from pantry" | 3 |
| 8.4 | Cost estimation | Ingredient price database + meal costing | Cost badges on meals, daily/weekly totals | 4 |

### DB Migrations

```sql
-- 018_ai_config.sql
CREATE TABLE ai_config (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT DEFAULT '' CHECK(provider IN ('','openai','anthropic','ollama','custom')),
  api_key_encrypted TEXT DEFAULT '',
  model TEXT DEFAULT '',
  base_url TEXT DEFAULT '',
  enabled INTEGER DEFAULT 0
);

-- 019_ingredient_prices.sql
ALTER TABLE ingredients ADD COLUMN price_per_unit REAL;
ALTER TABLE ingredients ADD COLUMN price_currency TEXT DEFAULT 'INR';
ALTER TABLE ingredients ADD COLUMN price_updated_at TEXT;
```

### Test Targets

| File | Tests | Covers |
|------|-------|--------|
| `tests/ai.test.js` | 8 | Config CRUD, provider validation, suggestion with mock, plan generation with mock, recipe generation with mock, disabled state, missing key, cost estimation |
| `tests/cost.test.js` | 4 | Meal cost, daily cost, weekly cost, missing prices handled |

**Phase 8 test total: 197 + 12 = 209**

---

## Testing Strategy

### Test Architecture

```
tests/
  helpers.js               — Shared factories, agents, DB setup/teardown
  auth.test.js             — Authentication & authorization (existing)
  recipes.test.js          — Recipe CRUD & search (existing, extended)
  ingredients.test.js      — Ingredients CRUD (existing, extended)
  meals.test.js            — Meal planning (existing, extended)
  shopping.test.js         — Shopping lists (existing, extended)
  households.test.js       — Phase 1: Household management
  persons.test.js          — Phase 1: Person management
  person-assignments.test.js — Phase 1: Per-person dish assignment
  seed.test.js             — Phase 2: Seed data integrity
  search.test.js           — Phase 2: Full-text search
  scaling.test.js          — Phase 2: Recipe scaling
  festivals.test.js        — Phase 3: Festival calendar
  fasting.test.js          — Phase 3: Fasting rules & compliance
  person-festivals.test.js — Phase 3: Person-festival linking
  polls.test.js            — Phase 4: Family polls
  leftovers.test.js        — Phase 4: Leftover tracking
  templates.test.js        — Phase 4: Meal templates
  pantry.test.js           — Phase 5: Pantry management
  shopping-advanced.test.js — Phase 5: Advanced shopping
  purchases.test.js        — Phase 5: Purchase history
  nutrition-advanced.test.js — Phase 6: Per-person nutrition
  import.test.js           — Phase 7: Recipe import
  recurrence.test.js       — Phase 7: Recurring meals
  notifications.test.js   — Phase 7: Notifications
  calendar.test.js         — Phase 7: Calendar view
  sharing.test.js          — Phase 7: WhatsApp/sharing
  ai.test.js               — Phase 8: AI features
  cost.test.js             — Phase 8: Cost estimation
  security.test.js         — Cross-cutting: Security regression
  performance.test.js      — Cross-cutting: Performance benchmarks
```

### Test Categories

#### 1. Unit Tests (per route module)
- Input validation (Zod schemas)
- Business logic (calculations, transformations)
- Error cases (404, 400, 403, 409)
- Edge cases (empty input, max values, special chars)

#### 2. Integration Tests (cross-module)
- Meal plan → shopping list generation (with pantry subtraction)
- Recipe → nutrition calculation (with micronutrients)
- Person assignment → per-person nutrition
- Festival → fasting rules → meal compliance
- Poll → vote → apply to meal plan
- Template → apply → person assignments preserved
- Recurrence → date expansion → shopping aggregation

#### 3. Security Tests (`tests/security.test.js`)

| # | Test | Description |
|---|------|-------------|
| S1 | CSRF token required | POST/PUT/DELETE without token → 403 |
| S2 | Session expiry | Expired session → 401 |
| S3 | Cross-household isolation | User A can't access User B's household data |
| S4 | SQL injection in search | `'; DROP TABLE --` in search → no effect |
| S5 | XSS in recipe name | `<script>alert(1)</script>` in name → escaped in response |
| S6 | Rate limiting | 201+ requests in window → 429 |
| S7 | Password policy | Weak passwords rejected at registration |
| S8 | Invite code brute-force | Rapid invalid codes → rate limited |
| S9 | Household join authorization | Valid code from deleted household → rejected |
| S10 | API key encryption | AI config API key stored encrypted, never returned in plaintext |

#### 4. Performance Tests (`tests/performance.test.js`)

| # | Test | Target |
|---|------|--------|
| P1 | Recipe list (500 recipes) | < 100ms |
| P2 | FTS search (500 recipes) | < 50ms |
| P3 | Shopping list generation (7-day plan, 5 persons) | < 200ms |
| P4 | Nutrition calculation (7-day, 5 persons) | < 200ms |
| P5 | Festival calendar lookup (12 months) | < 50ms |
| P6 | Pantry subtraction (100 items) | < 50ms |

#### 5. Data Integrity Tests (within each module)

- Foreign key cascades verified
- Unique constraints enforced
- CHECK constraints enforced (dietary_type, meal_type, etc.)
- JSON array fields parseable
- Date fields valid
- Numeric ranges enforced (spice_level 1–5)

### Coverage Targets

| Phase | Files | Test Count | Coverage Target |
|-------|-------|------------|-----------------|
| v0.1.0 (current) | 5 | 34 | ~60% |
| v0.2.0 | 9 | 64 | 70% |
| v0.3.0 | 12 | 86 | 75% |
| v0.4.0 | 14 | 109 | 75% |
| v0.5.0 | 17 | 135 | 80% |
| v0.6.0 | 19 | 157 | 80% |
| v0.7.0 | 22 | 171 | 80% |
| v0.8.0 | 24 | 197 | 80% |
| Final | 26 | 209+ | 85%+ |

---

## Schema Evolution Summary

### Tables by Phase

| Phase | New Tables | Cumulative |
|-------|-----------|------------|
| v0.1.0 (current) | 13 | 13 |
| v0.2.0 | 4 (households, persons, person_assignments, invite_codes) | 17 |
| v0.3.0 | 4 (festivals, fasting_rules, person_festivals, festival_recipes) | 21 |
| v0.4.0 | 5 (polls, poll_options, poll_votes, meal_templates, meal_template_items) | 26 |
| v0.5.0 | 2 (pantry, purchase_history) | 28 |
| v0.6.0 | 1 (nutrition_alerts) | 29 |
| v0.7.0 | 3 (recurrence_rules, notifications, notification_preferences) | 32 |
| v0.8.0 | 1 (ai_config) | 33 |

### Migration Files

```
src/db/migrations/
  001_households.sql
  002_persons.sql
  003_person_assignments.sql
  004_expand_meal_slots.sql
  005_invite_codes.sql
  006_recipe_region.sql
  007_fts_recipes.sql
  008_festivals.sql
  009_polls.sql
  010_leftovers.sql
  011_templates.sql
  012_pantry.sql
  013_purchase_history.sql
  014_micronutrients.sql
  015_nutrition_alerts.sql
  016_recurrence.sql
  017_notifications.sql
  018_ai_config.sql
  019_ingredient_prices.sql
```

---

## API Route Inventory (Final)

| Module | Current | Added | Final |
|--------|---------|-------|-------|
| auth.js | 5 | 0 | 5 |
| recipes.js | 7 | 4 | 11 |
| ingredients.js | 6 | 1 | 7 |
| meals.js | 7 | 3 | 10 |
| tags.js | 4 | 0 | 4 |
| nutrition.js | 6 | 4 | 10 |
| shopping.js | 7 | 4 | 11 |
| stats.js | 3 | 2 | 5 |
| data.js | 2 | 0 | 2 |
| households.js | — | 4 | 4 |
| persons.js | — | 5 | 5 |
| festivals.js | — | 4 | 4 |
| polls.js | — | 6 | 6 |
| pantry.js | — | 5 | 5 |
| templates.js | — | 4 | 4 |
| notifications.js | — | 3 | 3 |
| calendar.js | — | 2 | 2 |
| ai.js | — | 4 | 4 |
| seed.js | — | 2 | 2 |
| sharing.js | — | 2 | 2 |
| **Total** | **47** | **52** | **99** |

---

## Frontend View Evolution

| Phase | New Views / Changes |
|-------|-------------------|
| v0.2.0 | Household setup wizard, Family members panel, 6-slot planner, person assignment chips |
| v0.3.0 | Festival calendar overlay, fasting indicators, festival recipe collections |
| v0.4.0 | Poll creation & voting UI, leftover badges, template save/apply |
| v0.5.0 | Pantry management view, enhanced shopping with deep-links, share buttons |
| v0.6.0 | Per-person nutrition cards, weekly report dashboard, alert badges |
| v0.7.0 | Recipe import modal, recurrence UI, notification bell, cook mode, month calendar, WhatsApp share |
| v0.8.0 | AI settings, suggest button, generate week, cost badges |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Indian nutrition data quality | High — wrong calorie counts undermine trust | Cross-reference IFCT with USDA for common items; allow user correction |
| Festival date calculation | Medium — lunar calendar is complex | Use pre-calculated dates for 5 years; update annually. No live calculation |
| SQLite concurrency | Medium — multiple users in same household | WAL mode handles concurrent reads; writes are serialized (acceptable for household scale) |
| Recipe seed quality | High — bad recipes kill adoption | Manual curation only; no auto-generated content. Mark system recipes clearly |
| Scope creep per phase | Medium — each phase has 20+ test targets | Strict feature freeze per phase; only move forward after tests pass |
| Deep-link vendor changes | Low — URLs may change | Abstract URL builders; monitor quarterly |

---

## Definition of Done (per Phase)

1. All new tests pass (`npm test`)
2. All existing tests still pass (no regressions)
3. Coverage at or above phase target
4. DB migrations run cleanly on fresh database
5. DB migrations run cleanly on previous version's database
6. `docker compose up --build -d` starts successfully
7. CLAUDE.md updated with new metrics
8. Manual smoke test: create household → add person → plan meal → generate shopping list
