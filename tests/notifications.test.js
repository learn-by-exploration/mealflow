const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Notifications', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  it('GET /api/notifications — returns empty initially', async () => {
    const res = await agent().get('/api/notifications');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 0);
  });

  it('POST notification manually + GET returns it', async () => {
    const { db } = setup();
    db.prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)').run(
      1, 'morning_plan', 'Good morning!', 'Your meal plan for today'
    );

    const res = await agent().get('/api/notifications');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].title, 'Good morning!');
    assert.equal(res.body[0].read, 0);
  });

  it('POST /api/notifications/:id/read — marks as read', async () => {
    const { db } = setup();
    const r = db.prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)').run(
      1, 'cooking_reminder', 'Time to cook', 'Start cooking dinner'
    );

    const res = await agent().post(`/api/notifications/${r.lastInsertRowid}/read`);
    assert.equal(res.status, 200);
    assert.equal(res.body.read, 1);

    // Should not appear in unread list
    const listRes = await agent().get('/api/notifications');
    assert.equal(listRes.body.length, 0);

    // Should appear with all=true
    const allRes = await agent().get('/api/notifications?all=true');
    assert.equal(allRes.body.length, 1);
    assert.equal(allRes.body[0].read, 1);
  });

  it('GET /api/notifications/preferences — returns preferences', async () => {
    const res = await agent().get('/api/notifications/preferences');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('PUT /api/notifications/preferences — updates preference', async () => {
    const res = await agent().put('/api/notifications/preferences').send({
      type: 'morning_plan',
      enabled: true,
      time: '08:00',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.type, 'morning_plan');
    assert.equal(res.body.enabled, 1);
    assert.equal(res.body.time, '08:00');

    // Verify it persists
    const prefsRes = await agent().get('/api/notifications/preferences');
    const pref = prefsRes.body.find(p => p.type === 'morning_plan');
    assert.ok(pref);
    assert.equal(pref.time, '08:00');
  });
});
