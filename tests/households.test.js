const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makeInviteCode, makeUser2 } = require('./helpers');

describe('Households', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('POST /api/households — creates household with name', async () => {
    const res = await agent().post('/api/households').send({ name: 'Smith Family' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Smith Family');
    assert.ok(res.body.id);
  });

  it('POST /api/households — returns 409 if user already has household', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().post('/api/households').send({ name: 'Another Family' });
    assert.equal(res.status, 409);
  });

  it('GET /api/households/current — returns household with members', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().get('/api/households/current');
    assert.equal(res.status, 200);
    assert.ok(res.body.name);
    assert.ok(Array.isArray(res.body.members));
  });

  it('GET /api/households/current — returns 404 when no household', async () => {
    const res = await agent().get('/api/households/current');
    assert.equal(res.status, 404);
  });

  it('PUT /api/households/current — updates name', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().put('/api/households/current').send({ name: 'Updated Family' });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Updated Family');
  });

  it('POST /api/households/invite — generates invite code', async () => {
    makeHousehold({ created_by: 1 });
    const res = await agent().post('/api/households/invite');
    assert.equal(res.status, 201);
    assert.ok(res.body.code);
    assert.equal(res.body.code.length, 32);
  });

  it('POST /api/households/join — joins household with valid code', async () => {
    const hh = makeHousehold({ created_by: 1 });
    const code = makeInviteCode(hh.id, 1);
    const user2 = makeUser2();
    const res = await user2.agent.post('/api/households/join').send({ code });
    assert.equal(res.status, 200);
    assert.equal(res.body.household_id, hh.id);
  });

  it('POST /api/households/join — rejects expired/invalid code', async () => {
    const user2 = makeUser2();
    const res = await user2.agent.post('/api/households/join').send({ code: 'badcode1' });
    assert.equal(res.status, 404);
  });
});
