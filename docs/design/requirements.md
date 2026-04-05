---
status: Draft
version: 0.1.0
date: 2026-04-05
---

# MealFlow — Niche, Problem & Requirements Document

> **The Indian family meal planning problem is fundamentally different from what any existing app solves.**
> A thali is not a single plate. A household is not a single eater. A year is not 365 identical days.

---

## 1. The Niche

### 1.1 Market Position

MealFlow targets the **India-specific family meal planning** segment — the intersection of:

- **Indian cuisine complexity**: Multi-dish meals (dal + sabzi + roti + rice + raita), not single-recipe dinners
- **Per-person customization**: Different dishes/portions/spice levels per family member, not one-size-fits-all
- **Festival-aware scheduling**: 20–30+ food-significant occasions/year with specific dietary rules
- **Family coordination**: Democratic meal decisions, not top-down planning

### 1.2 Why This Niche Is Uncontested

| Dimension | What exists today | What's missing |
|-----------|-------------------|----------------|
| Meal unit | 1 recipe = 1 meal | Multi-course thali model (3–6 items per meal) |
| Family model | Same dish, different portions | Different dishes per person at same mealtime |
| Cultural awareness | Western recipe databases | Festival calendar, regional cuisine, fasting rules |
| Eating occasions | 3 (breakfast/lunch/dinner) | 5–6 (chai, nashta, tiffin, evening snack) |
| Spice/sugar | Binary (mild/spicy) | Per-person, per-dish spice level and sugar level |
| Decision making | Top-down planner | Poll-based family voting |
| Grocery integration | Instacart/Walmart (US) | Blinkit/Zepto/Swiggy Instamart/BigBasket (India) |

### 1.3 Market Size & Timing

- India = **#1 revenue market for nutrition apps globally at $1.9B** (Statista 2025)
- Asia-Pacific growing at **15.53% CAGR** (fastest globally)
- Two major incumbents (Yummly — $100M acquisition, PlateJoy) shut down in 2024–2025
- AI-native meal planning is a 2024–2026 wave
- No purpose-built Indian family meal planner exists

---

## 2. The Problem

### 2.1 Primary Problem Statement

**Indian families coordinate meals through WhatsApp messages, mental load, and guesswork.** The person responsible for cooking (usually one family member) must simultaneously solve:

1. **What to cook** — considering nutrition, variety, leftovers, and what's available
2. **For whom** — varying dietary needs (vegetarian elder, non-veg teenager, diabetic parent, fasting member)
3. **When** — 5–6 eating occasions per day, festivals, guests, school tiffin
4. **What to buy** — translating multi-dish plans into grocery lists across multiple stores
5. **How much** — quantities that minimize waste while feeding everyone

No single tool handles all five simultaneously. Families currently use:
- Mental memory (fragile, stressful)
- WhatsApp groups ("What do you want for dinner?")
- Google Keep / shared notes (no structure)
- Generic meal planning apps (designed for single-dish Western dinners)

### 2.2 Why Existing Solutions Fail

#### Western meal planners (Eat This Much, Mealime, Plan to Eat)
- Assume 1 recipe = 1 meal (a thali has 4–6 components)
- No per-person dish customization
- 3 meal slots (Indian households need 5–6)
- Recipe databases <1% Indian coverage
- Grocery delivery tied to US retailers only
- No festival/fasting awareness

#### Indian food apps (HealthifyMe, Archana's Kitchen, AMIYAA)
- HealthifyMe: Weight loss coaching, not household planning
- Archana's Kitchen: Content platform, not planning tool
- AMIYAA: Closest but lacks per-person customization, festival awareness, grocery integration

#### Generic tools (ChatGPT, Notion templates)
- No persistent state, no grocery integration
- Require manual effort every time
- ChatGPT meal plans are inconsistent and lack cultural depth

### 2.3 User Personas

#### Persona 1: Priya (The Primary Planner)
- 35, working professional in Bangalore
- Plans meals for 4: herself, husband, 8-year-old (picky eater), mother-in-law (diabetic, vegetarian)
- Shops on BigBasket weekly + Blinkit for daily needs
- Pain: Spends 30+ min daily deciding what to cook for 4 people with different needs
- Goal: "Tell me what to cook that everyone can eat, generate my shopping list, remind me to start cooking"

#### Persona 2: Anita (Joint Family Coordinator)
- 45, homemaker in Ahmedabad
- Plans for 7: husband, 2 children, elderly parents, brother's family on weekends
- Observes all Gujarati festivals, Navratri fasting, Ekadashi
- Pain: Festival planning is a multi-day mental project every time
- Goal: "Auto-plan Navratri meals with the right fasting ingredients, track who fasts which days"

#### Persona 3: Rohan (Health-Conscious Bachelor)
- 28, software engineer in Pune, lives alone
- Meal preps on Sundays, tracks macros
- Wants variety but cooks the same 10 dishes on rotation
- Pain: "I eat chicken breast and dal every day because I don't know what else hits my protein target"
- Goal: "Give me a protein-hitting Indian meal plan that isn't boring"

#### Persona 4: The Family WhatsApp Group
- 4–8 members debating what to order/cook
- "What should we have for dinner?" → 20 messages, no decision
- Pain: Decision paralysis, the loudest voice wins
- Goal: "Everyone votes, majority wins, done in 2 taps"

---

## 3. Requirements

### 3.1 Core Hierarchy: Household → Person → Meal Day → Meal Slot → Dish

```
Household (family unit)
  └── Person (member with dietary profile)
        ├── dietary_type: vegetarian | non-vegetarian | eggetarian | vegan | jain
        ├── restrictions: [nut-free, gluten-free, no-onion-garlic, diabetic-friendly, ...]
        ├── spice_level: 1–5 (per-person default)
        ├── sugar_level: 1–5 (per-person default)
        └── calorie_target, macro_targets (optional)

Meal Day (a date in the planner)
  └── Meal Slot (breakfast | morning-snack | lunch | evening-snack | dinner | custom)
        └── Dish (individual item within a meal slot)
              ├── recipe_id → recipe (or custom_name for quick entry)
              ├── person assignments (who eats this dish, or "everyone")
              ├── servings (per person or total)
              ├── spice_override (per-dish per-person, optional)
              └── notes ("less oil", "extra piece for Arjun")
```

### 3.2 Feature Requirements — Priority Tiers

#### P0 — MVP (Must ship)

| # | Feature | Description |
|---|---------|-------------|
| F1 | **Multi-course meal planning** | Plan 3–6 dishes per meal slot, not just 1 recipe. UI supports thali model |
| F2 | **Household & person management** | Create household, add members with names, dietary types, restrictions, age group |
| F3 | **Per-person dish assignment** | Assign dishes to specific people or "everyone". Person A gets Poha, Person B gets Upma |
| F4 | **6 meal slots per day** | Breakfast, morning snack, lunch, evening snack, dinner, custom. Configurable |
| F5 | **Indian recipe database** | Launch with 500+ curated Indian recipes across 8+ regional cuisines |
| F6 | **Indian ingredient database** | 1,000+ Indian ingredients with nutrition per 100g (IFCT-based) |
| F7 | **Auto grocery list generation** | Generate shopping list from meal plan date range, aggregate quantities, categorize by store section |
| F8 | **Pantry tracking (basic)** | Mark ingredients as "in stock" to subtract from shopping lists |
| F9 | **Nutrition per meal & per person** | Auto-calculate calories/protein/carbs/fat from recipe ingredients, show per-person daily totals |
| F10 | **Repeat/recurring meals** | Daily, weekly, specific-days (MWF), bi-weekly, monthly patterns |
| F11 | **Authentication & multi-user** | Per-user accounts with household sharing. Session-based auth (existing) |
| F12 | **Mobile-responsive SPA** | Works on phone browsers. Touch-friendly. PWA installable |

#### P1 — Essential (First month after MVP)

| # | Feature | Description |
|---|---------|-------------|
| F13 | **Festival calendar** | Built-in Indian festival calendar. Auto-suggest appropriate meals. Fasting rules per festival |
| F14 | **Fasting mode** | Per-person fasting toggles (Navratri, Ekadashi, Ramadan). Auto-adjust meal plans |
| F15 | **Family meal polls** | Create polls for meal decisions. Family members vote. Majority wins |
| F16 | **Spice & sugar profiling** | Per-person spice level (1–5) and sugar level (1–5). Per-dish overrides |
| F17 | **Recipe import (URL)** | Paste a URL, auto-parse recipe name, ingredients, instructions |
| F18 | **Leftover tracking** | Mark dishes as "leftover available". Suggest reuse in next day's plan |
| F19 | **Special requests per dish** | "Less oil for Amma", "Extra piece for kids" — notes attached to person+dish |
| F20 | **Weekly meal plan templates** | Save a week's plan as template. Apply template to future weeks |
| F21 | **Notifications** | Morning plan reminder, cooking-start alarm, shopping day reminder |
| F22 | **Quick-commerce deep links** | Link to add items on Blinkit/Zepto/BigBasket/Swiggy Instamart |

#### P2 — Differentiators (Months 2–3)

| # | Feature | Description |
|---|---------|-------------|
| F23 | **AI meal suggestions** | "What should I cook?" considering pantry, nutrition goals, recent history, preferences |
| F24 | **AI weekly plan generation** | Generate full week plan per person, respecting all constraints |
| F25 | **Nutrition goals & tracking** | Daily/weekly macro targets per person. Progress visualization |
| F26 | **Cost estimation** | Estimated meal cost from ingredient prices |
| F27 | **WhatsApp sharing** | Share today's plan / shopping list via WhatsApp with formatted text |
| F28 | **Recipe scaling** | Auto-scale ingredient quantities by serving count |
| F29 | **Cook mode** | Step-by-step recipe view with keep-screen-on, timer integration |
| F30 | **Meal plan calendar view** | Monthly calendar with color-coded meal slots, drag-and-drop |

#### P3 — Growth (Month 4+)

| # | Feature | Description |
|---|---------|-------------|
| F31 | **Recipe community** | Share recipes publicly. Browse community recipes |
| F32 | **Guest mode** | Add temporary guests to a day's plan (adjust portions/grocery) |
| F33 | **Batch cook planner** | Sunday prep: plan which dishes to batch cook, track portions frozen |
| F34 | **School tiffin planner** | Separate tiffin menu with kid-friendly options, pack reminders |
| F35 | **Multi-kitchen support** | Plan for hostel mess, office canteen, home — different contexts |
| F36 | **Budget mode** | Weekly budget constraint. Plan meals within budget. Track spending |
| F37 | **Dietary scoring** | Weekly nutrition report card. "Low on iron this week" alerts |
| F38 | **Regional cuisine rotation** | Auto-rotate between Punjabi, South Indian, Gujarati, Bengali, etc. |
| F39 | **Barcode scanning** | Scan packaged food to add to pantry/nutrition log |
| F40 | **Google Calendar sync** | Two-way sync meal plans with Google Calendar |

### 3.3 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Response time** | API < 200ms p95, page load < 2s on 4G |
| **Offline support** | View today's plan + shopping list offline. Queue changes |
| **Data ownership** | Self-hosted SQLite. Full export. No cloud dependency |
| **Mobile UX** | Touch targets ≥ 44px. Bottom nav on mobile. Swipe gestures |
| **Accessibility** | ARIA labels, keyboard nav, reduced-motion support |
| **Security** | Session auth, CSRF, rate limiting, parameterized SQL, XSS prevention |
| **Testing** | 80%+ coverage. Unit + integration + security tests |
| **Browser support** | Chrome 90+, Safari 15+, Firefox 90+, Samsung Internet |
| **Localization ready** | String externalization. RTL-ready layout. Hindi/regional scripts |
| **Data model** | Support 1–15 persons per household, 365 days of plans, 10K+ recipes |

### 3.4 Indian Cuisine Domain Model

#### Meal Types (Default 6 slots)
```
breakfast     — Poha, Upma, Paratha, Idli, Dosa, Aloo Puri
morning_snack — Chai + biscuit, fruit, sprouts
lunch         — Full thali: Dal + Sabzi + Roti/Rice + Raita + Salad + Pickle
evening_snack — Chai + samosa, pakora, chivda, sandwich
dinner        — Lighter thali or full thali depending on household
custom        — User-defined (Sunday brunch, midnight snack, etc.)
```

#### Ingredient Categories (Indian-specific)
```
grains        — Rice (basmati, sona masoori), Wheat (atta, maida, sooji), Millets (ragi, jowar, bajra)
pulses        — Toor dal, Moong dal, Chana dal, Masoor dal, Rajma, Chole, Urad dal
vegetables    — Seasonal: bhindi, karela, lauki, tinda, parwal, arbi, turai
leafy_greens  — Palak, methi, sarson, amaranth, bathua
dairy         — Milk, curd, paneer, ghee, buttermilk, khoya
spices        — Haldi, jeera, dhania, mirchi, hing, garam masala, amchur
oils          — Mustard oil, groundnut oil, coconut oil, sesame oil, ghee
proteins      — Chicken, mutton, fish, eggs, paneer, soy chunks, tofu
condiments    — Pickle (achar), chutney, papad, murabba
sweeteners    — Jaggery (gur), sugar, honey, dates
nuts_seeds    — Cashew, almond, peanuts, sesame, flax, chia
fruits        — Mango, banana, guava, papaya, pomegranate, chikoo
beverages     — Chai, coffee, lassi, nimbu pani, jaljeera, buttermilk
```

#### Dietary Types
```
vegetarian        — No meat, fish, eggs. Includes dairy
non_vegetarian    — Everything
eggetarian        — Vegetarian + eggs
vegan             — No animal products
jain              — No root vegetables, no onion/garlic, no fermented food
sattvic           — No onion, garlic, heavy spices. Simple, pure foods
swaminarayan      — No onion, garlic (specific Gujarati sect)
```

#### Festival Fasting Rules (Sample)
```
navratri          — 9 days: No grains, no onion/garlic. Allowed: kuttu, sabudana, rajgira, singhara, fruits, dairy
                    Regional variations: Some allow buckwheat, some don't
ekadashi          — Bi-monthly: No grains, no beans. Focus on fruits, milk, nuts
karva_chauth      — 1 day: Women fast sunrise to moonrise. Pre-dawn sargi meal
ramadan           — Month-long: No food dawn to sunset. Suhoor (pre-dawn) + Iftar (sunset)
shravan           — Month-long: Many skip non-veg. Some fully vegetarian
ganesh_chaturthi  — Modak preparation. 10-day festival meals
onam              — Elaborate sadya (26-dish banana leaf meal) single day
pongal            — Special rice dish preparation, harvest festival
makar_sankranti   — Til-gur (sesame-jaggery) specialties
```

---

## 4. Competitive Advantages

### 4.1 Five Genuinely Novel Features (Zero competition worldwide)

1. **Per-person dish customization within a meal** — "Person A gets Poha, Person B gets Upma"
2. **Poll-based family meal decisions** — Vote on dinner, majority wins
3. **Per-person spice/sugar level profiling** — Not just "mild/spicy" but 1–5 per person per dish
4. **Festival-aware auto-planning** — Detect upcoming festivals, auto-adjust with fasting rules
5. **Per-dish special requests** — "Less oil for Dad", "Extra piece for kids"

### 4.2 Strong Differentiators (Weak existing competition)

- **6 meal slots/day** (vs 3 in Western apps)
- **Multi-course meal model** (thali vs single plate)
- **Indian grocery delivery deep-links** (Blinkit, Zepto, BigBasket)
- **Repeat scheduling granularity** (daily, weekly, specific days, bi-weekly, monthly)
- **Indian nutrition database** (IFCT-based, katori measurements alongside grams)

### 4.3 Table-Stakes (Must match competitors)

- Grocery list quality → match Plan to Eat (date-range, dedup, categorize) + pantry subtraction
- Recipe import → match Paprika (95% URL extraction)
- Nutrition depth → approach Cronometer for Indian foods
- Calendar UX → match Plan to Eat/Prepear (drag-and-drop)

---

## 5. Technical Constraints & Decisions

### 5.1 Stack (Proven — ported from LifeFlow/PersonalFi)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | Express 5, Node.js 22+ | Battle-tested in 3 sister projects |
| Frontend | Vanilla JS SPA | No build step, instant reload, proven pattern |
| Database | SQLite (better-sqlite3) | Self-hosted, zero-ops, WAL for concurrent reads |
| Validation | Zod v4 | Consistent with LifeFlow/PersonalFi |
| Auth | bcryptjs + sessions + CSRF | Proven pattern, ported directly |
| Testing | node:test + supertest | Native, fast, zero-config |
| Deployment | Docker + docker-compose | Single container, health checks |

### 5.2 Data Strategy

- **Indian nutrition data**: Start with USDA FoodData Central + custom IFCT overlay for Indian foods
- **Recipe database**: Curate 500+ manually, support URL import for user additions
- **Festival calendar**: Hardcode 30+ festivals with rule engine for date calculation
- **Grocery integration**: Deep-link approach (no API dependency), optimize for copy-to-clipboard

### 5.3 Self-Hosted Principles

- All data in local SQLite — no cloud dependency
- Full JSON export/import
- Docker one-command deploy
- Works on Raspberry Pi (ARM-compatible)
- No external API calls required (AI features are optional, BYOK)

---

## 6. Success Metrics

### Launch (Month 1)
- All P0 features shipped and tested
- 500+ Indian recipes in database
- 1,000+ Indian ingredients with nutrition data
- 80%+ test coverage
- Works on mobile Chrome/Safari

### Growth (Month 3)
- P1 features complete
- Festival calendar covering 20+ festivals
- Family poll system functional
- Users can plan a full week in < 5 minutes

### Maturity (Month 6)
- P2 features including AI suggestions
- Daily active usage pattern established
- Community recipe sharing
- WhatsApp integration live
