const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, rawAgent } = require('./helpers');

describe('Auth', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('POST /api/auth/register — creates user', async () => {
    const res = await rawAgent().post('/api/auth/register').send({
      email: 'new@test.com', password: 'password123', display_name: 'New User'
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.email, 'new@test.com');
  });

  it('POST /api/auth/register — rejects duplicate email', async () => {
    const res = await rawAgent().post('/api/auth/register').send({
      email: 'test@test.com', password: 'password123'
    });
    assert.equal(res.status, 409);
  });

  it('POST /api/auth/register — rejects short password', async () => {
    const res = await rawAgent().post('/api/auth/register').send({
      email: 'short@test.com', password: '123'
    });
    assert.equal(res.status, 400);
  });

  it('POST /api/auth/login — authenticates valid user', async () => {
    const res = await rawAgent().post('/api/auth/login').send({
      email: 'test@test.com', password: 'testpassword'
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.id);
  });

  it('POST /api/auth/login — rejects invalid credentials', async () => {
    const res = await rawAgent().post('/api/auth/login').send({
      email: 'test@test.com', password: 'wrongpassword'
    });
    assert.equal(res.status, 401);
  });

  it('GET /api/auth/session — returns user when authenticated', async () => {
    const res = await agent().get('/api/auth/session');
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'test@test.com');
  });

  it('GET /api/auth/session — rejects unauthenticated', async () => {
    const res = await rawAgent().get('/api/auth/session');
    assert.equal(res.status, 401);
  });

  it('POST /api/auth/logout — clears session', async () => {
    const res = await agent().post('/api/auth/logout');
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
  });
});
