const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeRecipe, makeIngredient, addRecipeIngredient } = require('./helpers');

describe('AI', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('PUT /api/ai/config — saves config with encrypted key', async () => {
    const res = await agent().put('/api/ai/config').send({
      provider: 'openai',
      api_key: 'sk-test-key-12345',
      model: 'gpt-4o',
      base_url: '',
      enabled: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.provider, 'openai');
    assert.equal(res.body.model, 'gpt-4o');
    assert.equal(res.body.enabled, true);
    assert.equal(res.body.has_key, true);
    // Must never return the plaintext key
    assert.equal(res.body.api_key, undefined);
    assert.equal(res.body.api_key_encrypted, undefined);
  });

  it('GET /api/ai/config — returns config without plaintext key (has_key: true)', async () => {
    const { db } = setup();
    const { encrypt } = require('../src/services/ai');
    db.prepare(
      'INSERT INTO ai_config (user_id, provider, api_key_encrypted, model, base_url, enabled) VALUES (?,?,?,?,?,?)'
    ).run(1, 'anthropic', encrypt('sk-ant-test'), 'claude-3', '', 1);

    const res = await agent().get('/api/ai/config');
    assert.equal(res.status, 200);
    assert.equal(res.body.provider, 'anthropic');
    assert.equal(res.body.model, 'claude-3');
    assert.equal(res.body.has_key, true);
    assert.equal(res.body.enabled, true);
    assert.equal(res.body.api_key, undefined);
    assert.equal(res.body.api_key_encrypted, undefined);
  });

  it('GET /api/ai/config — returns has_key: false when no key set', async () => {
    const res = await agent().get('/api/ai/config');
    assert.equal(res.status, 200);
    assert.equal(res.body.has_key, false);
    assert.equal(res.body.enabled, false);
  });

  it('PUT /api/ai/config — validates provider enum', async () => {
    const res = await agent().put('/api/ai/config').send({
      provider: 'invalid-provider',
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/ai/suggest — returns suggestion (mock)', async () => {
    // Seed a recipe so the mock has something to suggest
    const recipe = makeRecipe({ name: 'Dal Tadka', cuisine: 'Indian' });
    const ing = makeIngredient({ name: 'Toor Dal' });
    addRecipeIngredient(recipe.id, ing.id, { quantity: 200 });

    const res = await agent().post('/api/ai/suggest').send({
      date: '2026-04-06',
      meal_type: 'lunch',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.suggestion);
    assert.ok(res.body.suggestion.name);
    assert.ok(res.body.suggestion.reason);
  });

  it('POST /api/ai/suggest — works when AI not configured (returns mock)', async () => {
    const res = await agent().post('/api/ai/suggest').send({});
    assert.equal(res.status, 200);
    assert.ok(res.body.suggestion);
    assert.ok(res.body.suggestion.name);
  });

  it('POST /api/ai/generate-week — returns weekly plan (mock)', async () => {
    // Seed some recipes
    makeRecipe({ name: 'Recipe A' });
    makeRecipe({ name: 'Recipe B' });
    makeRecipe({ name: 'Recipe C' });

    const res = await agent().post('/api/ai/generate-week').send({
      start_date: '2026-04-06',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.plan);
    assert.ok(res.body.plan.days);
    assert.equal(res.body.plan.days.length, 7);
    // Each day should have meals
    for (const day of res.body.plan.days) {
      assert.ok(day.date);
      assert.ok(Array.isArray(day.meals));
    }
  });

  it('Encryption roundtrip: encrypt/decrypt produces original value', async () => {
    const { encrypt, decrypt } = require('../src/services/ai');
    const original = 'sk-test-secret-api-key-12345';
    const encrypted = encrypt(original);
    assert.notEqual(encrypted, original);
    assert.ok(encrypted.includes(':'));
    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, original);
  });
});
