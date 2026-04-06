const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  setup, cleanDb, teardown, agent, rawAgent,
} = require('./helpers');

describe('Iterations 7-9: Performance, Config & Operational Resilience', () => {
  let db;

  before(() => {
    const s = setup();
    db = s.db;
  });

  beforeEach(() => cleanDb());
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════════
  // ITERATION 7: Performance & Static Assets
  // ═══════════════════════════════════════════════════════════════

  describe('Issue 20: login.html has no inline scripts', () => {
    it('login.html has no <script> tags with inline code', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf8');
      // Should have script src= but no inline <script>...</script> with code
      const scriptTags = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
      for (const tag of scriptTags) {
        // Allow <script src="..."></script> (empty body with src)
        if (/src=/.test(tag)) {
          const body = tag.replace(/<script[^>]*>/, '').replace(/<\/script>/, '').trim();
          assert.equal(body, '', 'Script tag with src should have empty body');
        } else {
          assert.fail(`Found inline script tag: ${tag.slice(0, 80)}...`);
        }
      }
    });

    it('login.html has inline styles (allowed by CSP unsafe-inline)', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf8');
      assert.ok(html.includes('<style>'), 'login.html should have a <style> block');
    });
  });

  describe('Issue 21: Service worker cache versioning', () => {
    it('sw.js CACHE_NAME includes version from package.json', () => {
      const swContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      assert.ok(
        swContent.includes(`mealflow-v${pkg.version}`),
        `CACHE_NAME should include version ${pkg.version}`
      );
    });

    it('sw.js precaches manifest.json', () => {
      const swContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      assert.ok(swContent.includes('/manifest.json'), 'PRECACHE should include /manifest.json');
    });

    it('sw.js activate event cleans up old caches', () => {
      const swContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
      assert.ok(
        swContent.includes('caches.keys') && swContent.includes('caches.delete'),
        'activate should clean up old caches'
      );
    });
  });

  describe('Issue 25: manifest.json icons use file references', () => {
    it('manifest.json icons reference file paths, not data: URIs', () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8')
      );
      for (const icon of manifest.icons) {
        assert.ok(!icon.src.startsWith('data:'), `Icon src should not be a data: URI: ${icon.src.slice(0, 50)}`);
        assert.ok(icon.src.startsWith('/'), `Icon src should be an absolute path: ${icon.src}`);
      }
    });

    it('icon.svg file exists', () => {
      const iconPath = path.join(__dirname, '..', 'public', 'icon.svg');
      assert.ok(fs.existsSync(iconPath), 'public/icon.svg should exist');
      const content = fs.readFileSync(iconPath, 'utf8');
      assert.ok(content.includes('<svg'), 'icon.svg should be valid SVG');
      assert.ok(content.includes('xmlns'), 'icon.svg should have xmlns');
    });
  });

  describe('Issue 26: Apple PWA meta tags', () => {
    it('index.html has apple-mobile-web-app-capable meta tag', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(
        html.includes('apple-mobile-web-app-capable'),
        'Should have apple-mobile-web-app-capable meta tag'
      );
    });

    it('index.html has apple-mobile-web-app-status-bar-style', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(
        html.includes('apple-mobile-web-app-status-bar-style'),
        'Should have apple-mobile-web-app-status-bar-style meta tag'
      );
    });

    it('index.html has apple-touch-icon link', () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      assert.ok(
        html.includes('apple-touch-icon'),
        'Should have apple-touch-icon link'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ITERATION 8: Configuration & Portability
  // ═══════════════════════════════════════════════════════════════

  describe('Issue 22: .env.example completeness', () => {
    it('.env.example has HOST variable', () => {
      const env = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
      assert.ok(env.includes('HOST='), '.env.example should contain HOST=');
    });

    it('.env.example has ALLOWED_ORIGINS', () => {
      const env = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
      assert.ok(env.includes('ALLOWED_ORIGINS'), '.env.example should document ALLOWED_ORIGINS');
    });

    it('.env.example documents all config.js env vars', () => {
      const env = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
      const configSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf8');

      // Extract env var names from config.js
      const envVarMatches = configSrc.match(/process\.env\.([A-Z_]+)/g) || [];
      const envVars = [...new Set(envVarMatches.map(m => m.replace('process.env.', '')))];

      // NODE_ENV is standard — doesn't need .env.example entry
      const skip = ['NODE_ENV'];
      for (const v of envVars) {
        if (skip.includes(v)) continue;
        assert.ok(env.includes(v), `.env.example should document ${v}`);
      }
    });
  });

  describe('Issue 24: docker-compose.prod.yml config', () => {
    it('docker-compose.prod.yml has HOST=0.0.0.0', () => {
      const yml = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.prod.yml'), 'utf8');
      assert.ok(yml.includes('HOST=0.0.0.0'), 'prod compose should set HOST=0.0.0.0');
    });

    it('docker-compose.prod.yml has restart: always', () => {
      const yml = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.prod.yml'), 'utf8');
      assert.ok(yml.includes('restart: always'), 'prod compose should have restart: always');
    });
  });

  describe('Docker volume permissions documentation', () => {
    it('docker-compose.yml has comment about data directory', () => {
      const yml = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
      assert.ok(
        yml.toLowerCase().includes('data') && yml.includes('#'),
        'docker-compose.yml should have comments about data volumes'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ITERATION 9: Operational Resilience
  // ═══════════════════════════════════════════════════════════════

  describe('Issue 27: Service worker update notification', () => {
    it('app.js listens for service worker controllerchange', () => {
      const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
      assert.ok(
        appJs.includes('controllerchange'),
        'app.js should listen for controllerchange event'
      );
    });

    it('app.js shows update toast on controllerchange', () => {
      const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
      assert.ok(
        appJs.includes('Update available') || appJs.includes('update available'),
        'app.js should show an update available message'
      );
    });
  });

  describe('Issue 29: Docker log rotation (verify)', () => {
    it('docker-compose.yml has log rotation config', () => {
      const yml = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
      assert.ok(yml.includes('max-size'), 'Should have log rotation max-size');
      assert.ok(yml.includes('max-file'), 'Should have log rotation max-file');
    });
  });

  describe('Issue 18: Rate limit documentation', () => {
    it('server.js has rate limit reset comment', () => {
      const serverJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
      assert.ok(
        serverJs.toLowerCase().includes('rate limit') && serverJs.toLowerCase().includes('restart'),
        'server.js should document that rate limits reset on restart'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // API sanity: existing endpoints still work
  // ═══════════════════════════════════════════════════════════════

  describe('Regression: core endpoints', () => {
    it('GET /api/health returns 200', async () => {
      const res = await agent().get('/api/health');
      assert.equal(res.status, 200);
      assert.ok(res.body.status === 'ok');
    });

    it('GET /api/recipes returns 200', async () => {
      const res = await agent().get('/api/recipes');
      assert.equal(res.status, 200);
    });

    it('static files are served with cache headers', async () => {
      const res = await rawAgent().get('/styles.css');
      assert.equal(res.status, 200);
      const cc = res.headers['cache-control'] || '';
      assert.ok(cc.includes('max-age'), 'Static files should have cache-control max-age');
    });
  });
});
