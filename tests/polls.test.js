const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, agent, makeHousehold, makeRecipe, makePoll, addPollOption, makeUser2 } = require('./helpers');

describe('Polls', () => {
  before(() => setup());
  beforeEach(() => cleanDb());
  after(() => teardown());

  function setupHousehold() {
    const h = makeHousehold();
    return h;
  }

  it('POST /api/polls — creates poll with options', async () => {
    setupHousehold();
    const recipe = makeRecipe();
    const res = await agent().post('/api/polls').send({
      question: 'What for dinner?',
      target_date: '2026-04-10',
      target_meal_type: 'dinner',
      options: [
        { recipe_id: recipe.id },
        { custom_name: 'Pizza from outside' },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.question, 'What for dinner?');
    assert.equal(res.body.options.length, 2);
  });

  it('GET /api/polls — lists household polls', async () => {
    const h = setupHousehold();
    makePoll(h.id, 1);
    const res = await agent().get('/api/polls');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
  });

  it('GET /api/polls/:id — returns poll with options and votes', async () => {
    const h = setupHousehold();
    const poll = makePoll(h.id, 1);
    const opt = addPollOption(poll.id, { custom_name: 'Dosa' });
    addPollOption(poll.id, { custom_name: 'Idli' });

    const res = await agent().get(`/api/polls/${poll.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.question, 'What for dinner?');
    assert.ok(res.body.options.length >= 2);
  });

  it('POST /api/polls/:id/vote — casts vote', async () => {
    const h = setupHousehold();
    const poll = makePoll(h.id, 1);
    const opt = addPollOption(poll.id, { custom_name: 'Dosa' });
    addPollOption(poll.id, { custom_name: 'Idli' });

    const res = await agent().post(`/api/polls/${poll.id}/vote`).send({ option_id: opt.id });
    assert.equal(res.status, 200);
    assert.ok(res.body.ok);
  });

  it('POST /api/polls/:id/vote — replaces previous vote', async () => {
    const h = setupHousehold();
    const poll = makePoll(h.id, 1);
    const opt1 = addPollOption(poll.id, { custom_name: 'Dosa' });
    const opt2 = addPollOption(poll.id, { custom_name: 'Idli' });

    await agent().post(`/api/polls/${poll.id}/vote`).send({ option_id: opt1.id });
    const res = await agent().post(`/api/polls/${poll.id}/vote`).send({ option_id: opt2.id });
    assert.equal(res.status, 200);

    // Check only one vote exists
    const { db } = setup();
    const votes = db.prepare('SELECT * FROM poll_votes WHERE poll_id = ?').all(poll.id);
    assert.equal(votes.length, 1);
    assert.equal(votes[0].option_id, opt2.id);
  });

  it('POST /api/polls/:id/close — closes poll, determines winner', async () => {
    const h = setupHousehold();
    const poll = makePoll(h.id, 1);
    const opt1 = addPollOption(poll.id, { custom_name: 'Dosa' });
    const opt2 = addPollOption(poll.id, { custom_name: 'Idli' });

    // Vote for opt1
    await agent().post(`/api/polls/${poll.id}/vote`).send({ option_id: opt1.id });

    const res = await agent().post(`/api/polls/${poll.id}/close`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'closed');
    assert.equal(res.body.winner.id, opt1.id);
  });

  it('POST /api/polls/:id/apply — applies winner to meal plan', async () => {
    const h = setupHousehold();
    const recipe = makeRecipe();
    const poll = makePoll(h.id, 1);
    const opt = addPollOption(poll.id, { recipe_id: recipe.id, custom_name: recipe.name });
    addPollOption(poll.id, { custom_name: 'Idli' });

    await agent().post(`/api/polls/${poll.id}/vote`).send({ option_id: opt.id });
    await agent().post(`/api/polls/${poll.id}/close`);

    const res = await agent().post(`/api/polls/${poll.id}/apply`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'applied');

    // Verify meal plan was created
    const mealsRes = await agent().get('/api/meals/2026-04-10');
    assert.equal(mealsRes.status, 200);
    const dinner = mealsRes.body.meals.find(m => m.meal_type === 'dinner');
    assert.ok(dinner);
    assert.ok(dinner.items.length > 0);
  });

  it('POST /api/polls/:id/apply — rejects if not closed', async () => {
    const h = setupHousehold();
    const poll = makePoll(h.id, 1);
    addPollOption(poll.id, { custom_name: 'Dosa' });
    addPollOption(poll.id, { custom_name: 'Idli' });

    const res = await agent().post(`/api/polls/${poll.id}/apply`);
    assert.equal(res.status, 400);
  });

  it('Poll scoped to household (other user cannot see)', async () => {
    const h = setupHousehold();
    makePoll(h.id, 1);

    const user2 = makeUser2();
    const h2 = makeHousehold({ name: 'Other Family', created_by: user2.userId });
    const res = await user2.agent.get('/api/polls');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 0);
  });

  it('Rejects empty options (< 2)', async () => {
    setupHousehold();
    const res = await agent().post('/api/polls').send({
      question: 'What for dinner?',
      target_date: '2026-04-10',
      target_meal_type: 'dinner',
      options: [{ custom_name: 'Only one' }],
    });
    assert.equal(res.status, 400);
  });

  it('Close already-closed poll returns error', async () => {
    const h = setupHousehold();
    const poll = makePoll(h.id, 1, { status: 'closed' });
    addPollOption(poll.id, { custom_name: 'Dosa' });

    const res = await agent().post(`/api/polls/${poll.id}/close`);
    assert.equal(res.status, 400);
  });

  it('Get 404 for non-existent poll', async () => {
    setupHousehold();
    const res = await agent().get('/api/polls/9999');
    assert.equal(res.status, 404);
  });
});
