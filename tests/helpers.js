const { tmpdir } = require('os');
const { mkdtempSync, rmSync } = require('fs');
const path = require('path');
const request = require('supertest');
const crypto = require('crypto');

let _app, _db, _dir, _testSessionId, _testUserId;

function setup() {
  if (!_app) {
    process.env.NODE_ENV = 'test';
    _dir = mkdtempSync(path.join(tmpdir(), 'mealflow-test-'));
    process.env.DB_DIR = _dir;
    const server = require('../src/server');
    _app = server.app;
    _db = server.db;
    _ensureTestAuth();
  }
  return { app: _app, db: _db, dir: _dir };
}

function _ensureTestAuth() {
  _testUserId = 1;
  const bcrypt = require('bcryptjs');
  const user = _db.prepare('SELECT id FROM users WHERE id = 1').get();
  if (!user) {
    const hash = bcrypt.hashSync('testpassword', 4);
    _db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run(
      'test@test.com', hash, 'Test User'
    );
  } else {
    const hash = bcrypt.hashSync('testpassword', 4);
    _db.prepare('UPDATE users SET password_hash=? WHERE id=1').run(hash);
  }
  _testSessionId = 'test-session-' + crypto.randomUUID();
  _db.prepare(
    "INSERT OR REPLACE INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 1, datetime('now', '+1 day'))"
  ).run(_testSessionId, _testUserId);
}

function cleanDb() {
  const { db } = setup();
  try { db.exec('DELETE FROM meal_ratings'); } catch {}
  try { db.exec('DELETE FROM recipe_versions'); } catch {}
  try { db.exec('DELETE FROM meal_slot_overrides'); } catch {}
  try { db.exec('DELETE FROM ai_config'); } catch {}
  try { db.exec('DELETE FROM recurrence_rules'); } catch {}
  try { db.exec('DELETE FROM notifications'); } catch {}
  try { db.exec('DELETE FROM notification_preferences'); } catch {}
  try { db.exec('DELETE FROM nutrition_alerts'); } catch {}
  try { db.exec('DELETE FROM purchase_history'); } catch {}
  try { db.exec('DELETE FROM pantry'); } catch {}
  try { db.exec('DELETE FROM poll_votes'); } catch {}
  try { db.exec('DELETE FROM poll_options'); } catch {}
  try { db.exec('DELETE FROM polls'); } catch {}
  try { db.exec('DELETE FROM meal_template_items'); } catch {}
  try { db.exec('DELETE FROM meal_templates'); } catch {}
  try { db.exec('DELETE FROM person_festivals'); } catch {}
  try { db.exec('DELETE FROM festival_recipes'); } catch {}
  try { db.exec('DELETE FROM fasting_rules'); } catch {}
  try { db.exec('DELETE FROM festivals'); } catch {}
  try { db.exec('DELETE FROM person_assignments'); } catch {}
  try { db.exec('DELETE FROM persons'); } catch {}
  try { db.exec('DELETE FROM invite_codes'); } catch {}
  try { db.exec('DELETE FROM households WHERE id > 0'); } catch {}
  try { db.exec('UPDATE users SET household_id = NULL'); } catch {}
  db.exec('DELETE FROM nutrition_log');
  db.exec('DELETE FROM shopping_list_items');
  db.exec('DELETE FROM shopping_lists');
  db.exec('DELETE FROM meal_plan_items');
  db.exec('DELETE FROM meal_plans');
  db.exec('DELETE FROM recipe_tags');
  db.exec('DELETE FROM recipe_ingredients');
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM ingredients');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM settings');
  try { db.exec("INSERT INTO recipes_fts(recipes_fts) VALUES('rebuild')"); } catch {}
  try { db.exec('DELETE FROM nutrition_goals'); } catch {}
  try { db.exec('DELETE FROM audit_log'); } catch {}
  try { db.exec('DELETE FROM login_attempts'); } catch {}
}

function teardown() {
  if (_db) { try { _db.close(); } catch {} }
  if (_dir) { try { rmSync(_dir, { recursive: true, force: true }); } catch {} }
}

function agent() {
  const { app } = setup();
  return request.agent(app).set('Cookie', `mf_sid=${_testSessionId}`);
}

function rawAgent() {
  const { app } = setup();
  return request(app);
}

function makeIngredient(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Ingredient', category: 'other', calories: 100, protein: 10, carbs: 20, fat: 5, fiber: 3, unit: 'g', user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO ingredients (user_id, name, category, calories, protein, carbs, fat, fiber, unit) VALUES (?,?,?,?,?,?,?,?,?)').run(
    o.user_id, o.name, o.category, o.calories, o.protein, o.carbs, o.fat, o.fiber, o.unit
  );
  return db.prepare('SELECT * FROM ingredients WHERE id=?').get(r.lastInsertRowid);
}

function makeRecipe(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Recipe', description: '', servings: 2, prep_time: 10, cook_time: 20, cuisine: 'Italian', difficulty: 'easy', user_id: 1, position: 0, region: '', is_system: 0, meal_suitability: '[]', ...overrides };
  if (typeof o.meal_suitability !== 'string') o.meal_suitability = JSON.stringify(o.meal_suitability);
  const r = db.prepare('INSERT INTO recipes (user_id, name, description, servings, prep_time, cook_time, cuisine, difficulty, position, region, is_system, meal_suitability) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
    o.user_id, o.name, o.description, o.servings, o.prep_time, o.cook_time, o.cuisine, o.difficulty, o.position, o.region, o.is_system, o.meal_suitability
  );
  return db.prepare('SELECT * FROM recipes WHERE id=?').get(r.lastInsertRowid);
}

function makeTag(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Tag', color: '#FF0000', user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?,?,?)').run(o.user_id, o.name, o.color);
  return db.prepare('SELECT * FROM tags WHERE id=?').get(r.lastInsertRowid);
}

function linkTag(recipeId, tagId) {
  const { db } = setup();
  db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?,?)').run(recipeId, tagId);
}

function addRecipeIngredient(recipeId, ingredientId, overrides = {}) {
  const { db } = setup();
  const o = { quantity: 100, unit: 'g', notes: '', position: 0, ...overrides };
  db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, notes, position) VALUES (?,?,?,?,?,?)').run(
    recipeId, ingredientId, o.quantity, o.unit, o.notes, o.position
  );
}

function makeMealPlan(overrides = {}) {
  const { db } = setup();
  const o = { date: '2026-04-05', meal_type: 'lunch', user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO meal_plans (user_id, date, meal_type) VALUES (?,?,?)').run(o.user_id, o.date, o.meal_type);
  return db.prepare('SELECT * FROM meal_plans WHERE id=?').get(r.lastInsertRowid);
}

function makeShoppingList(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Shopping List', user_id: 1, ...overrides };
  const r = db.prepare('INSERT INTO shopping_lists (user_id, name) VALUES (?,?)').run(o.user_id, o.name);
  return db.prepare('SELECT * FROM shopping_lists WHERE id=?').get(r.lastInsertRowid);
}

function makeUser2() {
  const { db } = setup();
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('testpassword2', 4);
  let user2 = db.prepare('SELECT id FROM users WHERE email = ?').get('test2@test.com');
  if (!user2) {
    const r = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)').run('test2@test.com', hash, 'Test User 2');
    user2 = { id: r.lastInsertRowid };
  }
  const sid2 = 'test-session-2-' + crypto.randomUUID();
  db.prepare("INSERT INTO sessions (sid, user_id, remember, expires_at) VALUES (?, ?, 1, datetime('now', '+1 day'))").run(sid2, user2.id);
  const { app } = setup();
  return { userId: user2.id, agent: request.agent(app).set('Cookie', `mf_sid=${sid2}`) };
}

function makeHousehold(overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Family', created_by: 1, ...overrides };
  const r = db.prepare('INSERT INTO households (name, created_by) VALUES (?,?)').run(o.name, o.created_by);
  db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(r.lastInsertRowid, o.created_by);
  return db.prepare('SELECT * FROM households WHERE id=?').get(r.lastInsertRowid);
}

function makePerson(householdId, overrides = {}) {
  const { db } = setup();
  const o = { name: 'Test Person', dietary_type: 'vegetarian', spice_level: 3, sugar_level: 3, ...overrides };
  const r = db.prepare('INSERT INTO persons (household_id, name, dietary_type, spice_level, sugar_level) VALUES (?,?,?,?,?)').run(
    householdId, o.name, o.dietary_type, o.spice_level, o.sugar_level
  );
  return db.prepare('SELECT * FROM persons WHERE id=?').get(r.lastInsertRowid);
}

function assignPersonToItem(itemId, personId, overrides = {}) {
  const { db } = setup();
  const o = { servings: 1, notes: '', ...overrides };
  const r = db.prepare('INSERT INTO person_assignments (meal_plan_item_id, person_id, servings, spice_override, sugar_override, notes) VALUES (?,?,?,?,?,?)').run(
    itemId, personId, o.servings, o.spice_override || null, o.sugar_override || null, o.notes
  );
  return db.prepare('SELECT * FROM person_assignments WHERE id=?').get(r.lastInsertRowid);
}

function makeInviteCode(householdId, userId) {
  const { db } = setup();
  const code = crypto.randomBytes(16).toString('hex');
  db.prepare("INSERT INTO invite_codes (code, household_id, created_by, expires_at) VALUES (?,?,?,datetime('now','+7 days'))").run(code, householdId, userId);
  return code;
}

function makeFestival(overrides = {}) {
  const { db } = setup();
  const o = {
    name: 'Test Festival',
    type: 'hindu',
    region: 'pan_india',
    date_rule: JSON.stringify({ type: 'fixed_yearly', dates: { '2026': '2026-04-10' } }),
    duration_days: 1,
    is_fasting: 0,
    ...overrides
  };
  const r = db.prepare('INSERT OR IGNORE INTO festivals (name, type, region, date_rule, duration_days, is_fasting, description, fasting_type) VALUES (?,?,?,?,?,?,?,?)').run(
    o.name, o.type, o.region, o.date_rule, o.duration_days, o.is_fasting, o.description || '', o.fasting_type || ''
  );
  if (r.changes === 0) return db.prepare('SELECT * FROM festivals WHERE name = ?').get(o.name);
  return db.prepare('SELECT * FROM festivals WHERE id = ?').get(r.lastInsertRowid);
}

function addFastingRule(festivalId, overrides = {}) {
  const { db } = setup();
  const o = { rule_type: 'deny', category: null, ingredient_name: null, notes: '', ...overrides };
  const r = db.prepare('INSERT INTO fasting_rules (festival_id, rule_type, category, ingredient_name, notes) VALUES (?,?,?,?,?)').run(
    festivalId, o.rule_type, o.category, o.ingredient_name, o.notes
  );
  return db.prepare('SELECT * FROM fasting_rules WHERE id = ?').get(r.lastInsertRowid);
}

function linkPersonFestival(personId, festivalId) {
  const { db } = setup();
  db.prepare('INSERT OR IGNORE INTO person_festivals (person_id, festival_id) VALUES (?,?)').run(personId, festivalId);
}

function linkFestivalRecipe(festivalId, recipeId) {
  const { db } = setup();
  db.prepare('INSERT OR IGNORE INTO festival_recipes (festival_id, recipe_id) VALUES (?,?)').run(festivalId, recipeId);
}

function makeMealPlanItem(mealPlanId, recipeId, overrides = {}) {
  const { db } = setup();
  const o = { servings: 1, position: 0, ...overrides };
  const r = db.prepare('INSERT INTO meal_plan_items (meal_plan_id, recipe_id, servings, position) VALUES (?,?,?,?)').run(
    mealPlanId, recipeId, o.servings, o.position
  );
  return db.prepare('SELECT * FROM meal_plan_items WHERE id = ?').get(r.lastInsertRowid);
}

function makePoll(householdId, userId, overrides = {}) {
  const { db } = setup();
  const o = { question: 'What for dinner?', target_date: '2026-04-10', target_meal_type: 'dinner', status: 'open', ...overrides };
  const r = db.prepare('INSERT INTO polls (household_id, created_by, question, target_date, target_meal_type, status) VALUES (?,?,?,?,?,?)').run(
    householdId, userId, o.question, o.target_date, o.target_meal_type, o.status
  );
  return db.prepare('SELECT * FROM polls WHERE id = ?').get(r.lastInsertRowid);
}

function addPollOption(pollId, overrides = {}) {
  const { db } = setup();
  const o = { custom_name: 'Option', position: 0, ...overrides };
  const r = db.prepare('INSERT INTO poll_options (poll_id, recipe_id, custom_name, position) VALUES (?,?,?,?)').run(
    pollId, o.recipe_id || null, o.custom_name, o.position
  );
  return db.prepare('SELECT * FROM poll_options WHERE id = ?').get(r.lastInsertRowid);
}

function makePantryItem(householdId, overrides = {}) {
  const { db } = setup();
  const o = { name: 'Rice', quantity: 1000, unit: 'g', category: 'grains', location: 'kitchen', ...overrides };
  const r = db.prepare('INSERT INTO pantry (household_id, name, quantity, unit, category, location) VALUES (?,?,?,?,?,?)').run(
    householdId, o.name, o.quantity, o.unit, o.category, o.location
  );
  return db.prepare('SELECT * FROM pantry WHERE id = ?').get(r.lastInsertRowid);
}

module.exports = {
  setup, cleanDb, teardown, agent, rawAgent,
  makeIngredient, makeRecipe, makeTag, linkTag, addRecipeIngredient,
  makeMealPlan, makeShoppingList, makeUser2,
  makeHousehold, makePerson, assignPersonToItem, makeInviteCode,
  makeFestival, addFastingRule, linkPersonFestival, linkFestivalRecipe, makeMealPlanItem,
  makePoll, addPollOption, makePantryItem,
};
