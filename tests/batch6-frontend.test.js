const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Batch 6 — Frontend backend support', () => {
  before(setup);
  beforeEach(cleanDb);
  after(teardown);

  describe('POST /api/seed/sample-plan', () => {
    it('creates 7-day sample plan with auto-seeded recipes', async () => {
      const res = await agent()
        .post('/api/seed/sample-plan')
        .expect(200);

      assert.ok(res.body.created > 0, 'should create some meals');
    });

    it('skips already-existing meal plans', async () => {
      // First seed
      const r1 = await agent()
        .post('/api/seed/sample-plan')
        .expect(200);
      const first = r1.body.created;
      assert.ok(first > 0);

      // Second seed should create 0 since all slots already filled
      const r2 = await agent()
        .post('/api/seed/sample-plan')
        .expect(200);
      assert.equal(r2.body.created, 0);
    });
  });
});
