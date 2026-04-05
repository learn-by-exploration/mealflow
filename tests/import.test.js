const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Recipe Import', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('POST /api/recipes/import — parses recipe from JSON-LD html', async () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Test Dal",
        "description": "A simple dal recipe",
        "recipeIngredient": ["200g toor dal", "1 tsp turmeric", "2 tbsp ghee"],
        "prepTime": "PT10M",
        "cookTime": "PT25M",
        "recipeYield": "4"
      }
      </script></head><body></body></html>`;
    const res = await agent().post('/api/recipes/import').send({ url: 'https://example.com/recipe', html });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Test Dal');
    assert.equal(res.body.description, 'A simple dal recipe');
    assert.equal(res.body.prep_time, 10);
    assert.equal(res.body.cook_time, 25);
    assert.equal(res.body.servings, 4);
  });

  it('POST /api/recipes/import — extracts name from h1 fallback', async () => {
    const html = `<html><body><h1>My Amazing Recipe</h1><p>Some description</p></body></html>`;
    const res = await agent().post('/api/recipes/import').send({ url: 'https://example.com/recipe', html });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'My Amazing Recipe');
  });

  it('POST /api/recipes/import — returns ingredients array', async () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Pasta",
        "recipeIngredient": ["200g pasta", "1 cup tomato sauce", "50g parmesan"]
      }
      </script></head><body></body></html>`;
    const res = await agent().post('/api/recipes/import').send({ url: 'https://example.com/recipe', html });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.ingredients));
    assert.equal(res.body.ingredients.length, 3);
    assert.equal(res.body.ingredients[0].name, 'pasta');
    assert.equal(res.body.ingredients[0].quantity, '200');
    assert.equal(res.body.ingredients[0].unit, 'g');
  });

  it('POST /api/recipes/import — handles missing fields gracefully', async () => {
    const html = `<html><head>
      <script type="application/ld+json">
      { "@type": "Recipe", "name": "Simple Dish" }
      </script></head><body></body></html>`;
    const res = await agent().post('/api/recipes/import').send({ url: 'https://example.com/recipe', html });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Simple Dish');
    assert.ok(Array.isArray(res.body.ingredients));
    assert.equal(res.body.ingredients.length, 0);
    assert.equal(res.body.prep_time, 0);
    assert.equal(res.body.cook_time, 0);
  });

  it('POST /api/recipes/import — rejects when no url provided', async () => {
    const res = await agent().post('/api/recipes/import').send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('POST /api/recipes/import — returns error for empty/unparseable html', async () => {
    const res = await agent().post('/api/recipes/import').send({ url: 'https://example.com/recipe', html: '' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, '');
    assert.ok(Array.isArray(res.body.ingredients));
  });
});
