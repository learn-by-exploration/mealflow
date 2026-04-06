# Changelog

All notable changes to MealFlow are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-04-06

MealFlow v1.0.0 — the first production-ready release. 559 tests, 45 database tables,
144 API routes across 24 route modules, 36 SQL migrations, 12 Zod schemas,
5 services, 6 middleware layers, and a complete vanilla JS SPA frontend.

### Added

#### Security (Batches 1–2)
- Household-scoped data access — users can only access their own household's data
- Household role model (admin/member) with role-based authorization
- Per-user sliding-window rate limiting middleware
- Password strength validation (min length, complexity)
- Session invalidation on password change
- Account deletion with full data wipe
- Cookie security flags (httpOnly, sameSite, secure)
- Pino log redaction for sensitive fields
- CORS origin whitelist configuration
- API endpoint authorization audit tests
- Input sanitization tests (XSS, SQL injection)
- API key encryption validation
- Session token entropy verification
- CSP tightening via Helmet

#### Backend API (Batches 2–3, 9)
- Pagination on recipes, ingredients, shopping lists, and audit log
- ETag response caching for list endpoints
- Batch nutrition calculation (enrichRecipes)
- Audit log rotation (90-day retention)
- Consistent error response format: `{error, code, details}`
- X-Request-Id middleware on all requests
- Health check endpoints: `GET /api/health`, `GET /api/health/metrics`
- Graceful 413 response for payloads exceeding 1MB
- iCal export for meal plans (VCALENDAR format)
- CSV export for nutrition data
- Bulk meal plan operations (multi-day copy/delete)
- Recipe image upload via multer (2MB, JPEG/PNG/WebP)
- OpenAPI 3.0.3 specification + `GET /api/docs`
- WebSocket notifications for household broadcast
- Sort/order query parameters on recipes and ingredients
- Household person count in API responses

#### DevOps & CI/CD (Batch 3)
- GitHub Actions CI workflow (Node.js 22, lint, test, coverage)
- c8 test coverage reporting with lcov output
- ESLint CI gate
- Docker multi-stage build optimization
- Automated database backup script
- Structured request logging (method, path, status, duration, userId, requestId)
- Error rate tracking (`GET /api/health/metrics`)
- Database size monitoring in health endpoint
- Startup readiness probe (`GET /ready`, 503 until DB ready)
- Graceful shutdown with connection draining (SIGTERM/SIGINT)
- Docker Compose production profile
- Environment validation on startup (Zod schema)
- npm audit check in CI pipeline

#### Data Model & Analytics (Batch 4)
- Meal rating system (1–5 stars per meal plan item)
- Soft delete for recipes (archived flag, restore endpoint)
- Recipe version history (track changes, revert to previous)
- Shopping list completion tracking (completed_at timestamp)
- Meal plan notes (per meal-plan-item notes field)
- Most-cooked recipes report (`GET /api/stats/top-recipes`)
- Ingredient usage frequency report (`GET /api/stats/ingredient-usage`)
- Meal variety score (`GET /api/stats/variety`)
- Cost trend report (`GET /api/cost/trend`)
- Festival meal compliance report (`GET /api/festivals/compliance`)
- CSV export format option (`GET /api/data/export?format=csv`)

#### Indian Cuisine Domain (Batch 5)
- 6 regional recipe collections (Gujarati, Bengali, Maharashtrian, Rajasthani, Hyderabadi, Goan)
- 15 street food / chaat recipes
- Meal type classification (breakfast, lunch, dinner suitability)
- Thali composition rules with completeness scoring
- Seasonal ingredient flags and season-based filtering
- Cooking method classification (tadka, dum, bhunao, etc.)
- Regional festival variations with region-scoped fasting rules
- Jain dietary rules engine
- Sattvic/Swaminarayan diet support
- Ekadashi fasting calendar (`GET /api/festivals/ekadashi`)
- Ramadan/Roza meal timing with meal slot overrides
- Hindi/regional name aliases for ingredient search
- Indian unit conversions (katori, chammach, glass → metric)
- IFCT nutrition data validation
- Pickle/achaar/chutney as condiment category (halved portions)

#### Frontend Views (Batch 6)
- First-login household wizard (4-step onboarding)
- Sample meal plan seeding with dietary matching
- Empty-state guidance on all views
- Weekly planner view (7-day grid, 6 meal slots)
- Household management UI (Settings → Family)
- Festival configuration UI (Settings → Festivals)
- Polls/voting UI with real-time results
- Pantry management UI with expiry tracking
- Settings page (multi-tab: Profile, Family, Festivals, Notifications, AI)
- Meal template UI (save/apply weekly templates)
- Quick-add meal from history
- Cooking timer integration

#### Frontend UX & Accessibility (Batch 7)
- Mobile bottom navigation (5 primary icons)
- Touch-friendly 44×44px minimum targets
- Swipe gestures on planner (navigate weeks)
- Pull-to-refresh on Today and Shopping views
- ARIA labels, roles, and live regions throughout
- Keyboard navigation with focus trapping in modals
- WCAG AA color contrast compliance
- Screen reader meal summaries
- Skeleton loading states
- Optimistic UI for toggle actions
- Inline form validation with error messages
- Meal slot color coding (6 distinct colors)
- Recipe detail bottom sheet (mobile)
- Search filters drawer with tag chips
- Shopping list completion celebration (confetti)
- "What's for today?" notification banner
- Recipe of the day (`GET /api/recipes/suggestion/daily`)
- Nutrition trend chart (Canvas API)

#### QA & Testing (Batch 8)
- Frontend API contract validation tests
- Login flow lifecycle tests
- Recipe CRUD comprehensive tests
- Meal plan comprehensive tests
- API response shape validation tests
- Concurrent edit safety tests
- Unicode recipe names (Hindi, Tamil, emoji)
- Date boundary handling tests
- Empty household edge case tests
- Zero-quantity shopping item tests
- API contract tests for 10 endpoints
- Migration idempotency tests
- Load test with 100 recipes
- Backup/export validation tests
- Session expiry handling tests

#### Project Integrity (Batch 10)
- Project integrity integration tests (47 tests)
- Migration file integrity validation (001–036)
- Database table existence verification
- Route module loading verification
- CHANGELOG.md documentation

### Changed
- Version bumped from 0.9.0 to 1.0.0
- Database from 13 inline tables to 45 tables (13 inline + 36 migrations)
- API routes from ~47 to 144 across 24 modules
- Test count from 206 to 559 across 39 test files
- Enhanced seed data with dietary matching
- Improved error responses with structured format

### Security
- Session-based authentication on all API routes (except `/api/auth/*` and health checks)
- CSRF protection on all mutating requests
- Helmet security headers with strict CSP
- Rate limiting (global + per-user + auth-specific)
- bcryptjs password hashing (configurable salt rounds)
- Account lockout after 5 failed login attempts (15-minute window)
- Cookie flags: httpOnly, sameSite=strict, secure (in production)
- Input validation via Zod schemas on all write endpoints
- SQL injection prevention via parameterized queries (better-sqlite3)
- XSS prevention via HTML entity escaping + CSP

## [0.9.0] — 2026-04-05

Phase 8: Intelligence — AI BYOK configuration, weekly plan generation, cost estimation.

## [0.8.0] — 2026-04-05

Phase 7: Full Experience — Recipe import, recurring meals, notifications, calendar view.

## [0.7.0] — 2026-04-04

Phase 6: Nourished — Per-person nutrition, micronutrients, weekly reports, dietary alerts.

## [0.6.0] — 2026-04-04

Phase 5: Smart Shopping — Pantry management, smart aggregation, quick-commerce deep links.

## [0.5.0] — 2026-04-03

Phase 4: Family Decisions — Polls & voting, leftover tracking, meal templates.

## [0.4.0] — 2026-04-03

Phase 3: Festival Ready — Festival calendar, fasting rules, per-person fasting.

## [0.3.0] — 2026-04-02

Phase 2: Indian Kitchen — 500+ Indian recipes, 1000+ ingredients, regional cuisines, FTS.

## [0.2.0] — 2026-04-01

Phase 1: The Foundation — Households, persons, 6 meal slots, per-person assignment, spice/sugar profiles.

## [0.1.0] — 2026-03-30

Initial release — Auth, recipes, ingredients, meal plans, shopping lists, nutrition, tags, data export.
