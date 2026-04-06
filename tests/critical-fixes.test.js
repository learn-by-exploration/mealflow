const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent } = require('./helpers');

describe('Critical Fixes — CSP, Routing, Persistence', () => {
  before(setup);
  beforeEach(cleanDb);
  after(teardown);

  // ─── Issue 1: login.html must not have inline <script> ───
  describe('Issue 1: login.html CSP compliance', () => {
    it('login.html contains no inline <script> blocks', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf-8');
      // Should not have <script> with content — only <script src="...">
      const inlineScripts = html.match(/<script(?![^>]*\bsrc\b)[^>]*>[\s\S]+?<\/script>/gi);
      assert.equal(inlineScripts, null, 'login.html should have no inline scripts');
    });

    it('login.html loads js/login.js as external script', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf-8');
      assert.ok(html.includes('/js/login.js'), 'should reference /js/login.js');
    });

    it('public/js/login.js exists and handles form submission', () => {
      const jsPath = path.join(__dirname, '..', 'public', 'js', 'login.js');
      assert.ok(fs.existsSync(jsPath), 'js/login.js should exist');
      const js = fs.readFileSync(jsPath, 'utf-8');
      assert.ok(js.includes('addEventListener'), 'should use addEventListener');
      assert.ok(js.includes('/api/auth/login') || js.includes('/api/auth/'), 'should call auth API');
    });

    it('GET /login serves login page without CSP violation', async () => {
      const res = await agent().get('/login').expect(200);
      const csp = res.headers['content-security-policy'];
      assert.ok(csp, 'should have CSP header');
      // CSP should NOT need unsafe-inline for scripts
      const scriptSrc = csp.match(/script-src\s+([^;]+)/);
      assert.ok(scriptSrc, 'should have script-src directive');
      assert.ok(!scriptSrc[1].includes("'unsafe-inline'"), 'script-src should not have unsafe-inline');
    });
  });

  // ─── Issue 2: app.js must not use inline onclick handlers ───
  describe('Issue 2: app.js no inline onclick handlers', () => {
    it('app.js contains no onclick= in innerHTML strings', () => {
      const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
      // Match onclick= within template literals (innerHTML contexts)
      const onclickMatches = js.match(/onclick\s*=/gi);
      assert.equal(onclickMatches, null, 'app.js should have no onclick= attributes');
    });
  });

  // ─── Issue 3: .dockerignore exists ───
  describe('Issue 3: .dockerignore', () => {
    it('.dockerignore exists and excludes node_modules and tests', () => {
      const diPath = path.join(__dirname, '..', '.dockerignore');
      assert.ok(fs.existsSync(diPath), '.dockerignore should exist');
      const content = fs.readFileSync(diPath, 'utf-8');
      assert.ok(content.includes('node_modules'), 'should exclude node_modules');
      assert.ok(content.includes('tests'), 'should exclude tests');
      assert.ok(content.includes('.git'), 'should exclude .git');
    });

    it('.dockerignore does NOT exclude src/ or public/ or data/', () => {
      const content = fs.readFileSync(path.join(__dirname, '..', '.dockerignore'), 'utf-8');
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      assert.ok(!lines.includes('src/'), 'should not exclude src/');
      assert.ok(!lines.includes('public/'), 'should not exclude public/');
      assert.ok(!lines.includes('data/'), 'should not exclude data/');
    });
  });

  // ─── Issue 4: Deep links should work via SPA fallback ───
  describe('Issue 4: Deep link SPA routing', () => {
    it('app.js reads location.pathname for initial view', () => {
      const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
      assert.ok(js.includes('location.pathname') || js.includes('window.location.pathname'),
        'should read pathname for initial view');
    });
  });

  // ─── Issue 5: Browser history support ───
  describe('Issue 5: Browser history support', () => {
    it('app.js uses history.pushState', () => {
      const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
      assert.ok(js.includes('history.pushState'), 'should use pushState for navigation');
    });

    it('app.js listens for popstate events', () => {
      const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
      assert.ok(js.includes('popstate'), 'should handle popstate for back/forward');
    });
  });

  // ─── Issue 6: Service worker registration ───
  describe('Issue 6: Service worker registration', () => {
    it('app.js registers the service worker', () => {
      const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
      assert.ok(js.includes('serviceWorker') && js.includes('register'), 'should register service worker');
    });
  });

  // ─── Issue 7: .gitignore allows seed data but ignores db files ───
  describe('Issue 7: .gitignore seed data', () => {
    it('.gitignore does not have a bare data/ entry', () => {
      const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf-8');
      const lines = gi.split('\n').map(l => l.trim());
      assert.ok(!lines.includes('data/'), '.gitignore should not have bare data/ line');
    });

    it('.gitignore ignores data/*.db files', () => {
      const gi = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf-8');
      assert.ok(gi.includes('data/*.db'), 'should ignore data/*.db');
    });
  });

  // ─── Issue 9: Automated backup scheduling ───
  describe('Issue 9: Backup scheduling', () => {
    it('server.js contains backup interval logic', () => {
      const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf-8');
      assert.ok(server.includes('backup') && server.includes('setInterval'),
        'server.js should have backup interval');
    });
  });

  // ─── Issue 12: Expired session cleanup ───
  describe('Issue 12: Expired session cleanup', () => {
    it('server.js cleans expired sessions', () => {
      const server = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf-8');
      assert.ok(server.includes('DELETE FROM sessions') && server.includes('expires_at'),
        'server.js should clean expired sessions');
    });
  });
});
