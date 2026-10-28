import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const apiUrl = moduleUrl(stripTypeScriptTypes(await read('server/green-api.ts'), { mode: 'transform' }));
const { greenApiUrl } = await import(apiUrl);
const tenantUrl = moduleUrl('export async function findGreenApiStore(id) { return id === "71070000001" ? 91 : id === "71070000002" ? 92 : null; }');
const routeSource = stripTypeScriptTypes(await read('server/green-api-routes.ts'), { mode: 'transform' })
  .replace('"./green-api"', JSON.stringify(apiUrl)).replace('"./green-api-tenant"', JSON.stringify(tenantUrl));
const { registerGreenApiRoutes } = await import(moduleUrl(routeSource));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function setup(saved = new Map()) {
  const routes = new Map();
  const auth = () => {};
  const app = Object.fromEntries(['get', 'put', 'post'].map(method => [method, (path, middleware, handler) => {
    assert.equal(middleware, auth);
    routes.set(method + ' ' + path, handler);
  }]));
  const storage = {
    getAiSettings: async id => saved.get(id),
    upsertAiSettings: async (id, data) => {
      const value = { ...saved.get(id), ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
      saved.set(id, value);
      return value;
    },
  };
  registerGreenApiRoutes(app, auth, storage);
  return { routes, app, auth, storage, saved };
}
async function call(ctx, route, body = {}, storeId = 91) {
  let code = 200, result;
  const headers = {};
  const res = { set(k,v) { headers[k] = v; return this; }, status(n) { code = n; return this; }, json(data) { result = JSON.parse(JSON.stringify(data)); return this; } };
  await ctx.routes.get(route)({ body, user: { storeId } }, res);
  return { code, body: result, headers };
}
function upstream(data, status = 200) {
  globalThis.fetch = async () => Response.json(data, { status });
}

test('routes modern 7107 credentials to their pool and preserves legacy hosts', () => {
  assert.equal(greenApiUrl('71070000001', 'getStateInstance', 'test-token'), 'https://7107.api.greenapi.com/waInstance71070000001/getStateInstance/test-token');
  assert.match(greenApiUrl('1101000000', 'sendMessage', 'test-token'), /^https:\/\/api.green-api.com\//);
  assert.throws(() => greenApiUrl('../host', 'qr', 'test-token'));
});
test('connection test returns authorized JSON and uses bounded GET without sending messages', async () => {
  const ctx = setup();
  globalThis.fetch = async (url, options) => {
    assert.match(url, /7107\.api\.greenapi\.com\/waInstance71070000001\/getStateInstance\//);
    assert.equal(options.body, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ stateInstance: 'authorized' });
  };
  const result = await call(ctx, 'post /api/automation/green-api-test', { instanceId: '71070000001', apiToken: 'test-token' });
  assert.equal(result.body.ok, true);
  assert.equal(result.body.status, 'authorized');
  assert.equal(result.headers['Cache-Control'], 'no-store');
});
test('saved credentials work after reload and cannot be reused for another store or instance', async () => {
  const ctx = setup(new Map([[91, { greenApiInstanceId: '71070000001', greenApiApiToken: 'saved-token' }]]));
  upstream({ stateInstance: 'authorized' });
  assert.equal((await call(ctx, 'post /api/automation/green-api-test')).body.ok, true);
  assert.equal((await call(ctx, 'get /api/automation/whatsapp/green-status')).body.status, 'authorized');
  assert.equal((await call(ctx, 'post /api/automation/green-api-test', {}, 92)).code, 400);
  assert.equal((await call(ctx, 'post /api/automation/green-api-test', { instanceId: '71070000002' })).code, 400);
});
test('QR returns an image, alreadyLogged, or a clear expiry message', async () => {
  const ctx = setup();
  const body = { instanceId: '71070000001', apiToken: 'test-token' };
  upstream({ type: 'qrCode', message: 'cXItcG5n' });
  assert.equal((await call(ctx, 'post /api/automation/green-api-qr', body)).body.qrBase64, 'cXItcG5n');
  upstream({ type: 'alreadyLogged' });
  assert.equal((await call(ctx, 'post /api/automation/green-api-qr', body)).body.alreadyLogged, true);
  upstream({ type: 'timeout' });
  assert.match((await call(ctx, 'post /api/automation/green-api-qr', body)).body.message, /expiré/);
});
test('HTML, provider errors, malformed state, and network failures produce safe JSON', async () => {
  const ctx = setup();
  const body = { instanceId: '71070000001', apiToken: 'secret-test-token' };
  const failures = [
    async () => new Response('<!DOCTYPE html>bad gateway'),
    async () => Response.json({ message: 'secret-test-token' }, { status: 401 }),
    async () => Response.json({}, { status: 429 }),
    async () => Response.json({}),
    async () => { throw new Error('secret-test-token'); },
  ];
  for (const fetcher of failures) {
    globalThis.fetch = fetcher;
    const response = await call(ctx, 'post /api/automation/green-api-test', body);
    assert.ok(response.code >= 400);
    assert.equal(response.body.ok, false);
    assert.doesNotMatch(JSON.stringify(response.body), /secret-test-token|DOCTYPE|Unexpected token/);
  }
});
test('invalid credentials and missing store fail before contacting Green API', async () => {
  const ctx = setup();
  globalThis.fetch = () => { throw new Error('must not fetch'); };
  for (const body of [{instanceId: []}, {instanceId:'../bad',apiToken:'token'}, {instanceId:'71070000001',apiToken:'has whitespace'}]) {
    assert.equal((await call(ctx, 'post /api/automation/green-api-test', body)).code, 400);
  }
  assert.equal((await call(ctx, 'get /api/automation/whatsapp/green-status', {}, null)).code, 403);
});

// Exercise the actual existing settings handlers, rather than duplicating their logic.
const allRoutes = await read('server/routes.ts');
const settingsCode = allRoutes.slice(allRoutes.indexOf('  app.get("/api/automation/ai-settings"'), allRoutes.indexOf('  /* ── Nouveau orders for AI'));
function settingsSetup() {
  const ctx = setup();
  vm.runInNewContext(stripTypeScriptTypes(settingsCode, { mode: 'transform' }), { app: ctx.app, requireAuth: ctx.auth, storage: ctx.storage });
  return ctx;
}
test('settings save and reload retain credentials without returning the token', async () => {
  const ctx = settingsSetup();
  const put = await call(ctx, 'put /api/automation/ai-settings', { greenApiInstanceId: '71070000001', greenApiApiToken: 'private-token', enabled: 0 });
  assert.equal(put.body.hasGreenApiCreds, true);
  assert.equal(put.body.greenApiApiToken, undefined);
  const get = await call(ctx, 'get /api/automation/ai-settings');
  assert.equal(get.body.hasGreenApiCreds, true);
  assert.equal(get.body.greenApiApiToken, undefined);
  await call(ctx, 'put /api/automation/ai-settings', { greenApiInstanceId: '71070000001', systemPrompt: 'unchanged workflow' });
  assert.equal(ctx.saved.get(91).greenApiApiToken, 'private-token');
  assert.equal((await call(ctx, 'put /api/automation/ai-settings', { greenApiInstanceId:'71070000002' })).code, 400);
  upstream({ stateInstance:'authorized' });
  assert.equal((await call(ctx, 'post /api/automation/green-api-test')).body.ok, true);
  await call(ctx, 'put /api/automation/ai-settings', { greenApiInstanceId: '', greenApiApiToken: '' });
  assert.equal((await call(ctx, 'get /api/automation/ai-settings')).body.hasGreenApiCreds, false);
  assert.equal((await call(ctx, 'post /api/automation/green-api-test')).code, 400);
});
test('Green API changes do not clear AI provider keys or affect another store', async () => {
  const ctx = settingsSetup();
  ctx.saved.set(91, { openaiApiKey:'ai-secret', aiModel:'existing-model', enabled:0 });
  ctx.saved.set(92, { greenApiInstanceId:'71070000002', greenApiApiToken:'other-store-token' });
  await call(ctx, 'put /api/automation/ai-settings', { greenApiInstanceId:'71070000001', greenApiApiToken:'own-token' });
  assert.equal(ctx.saved.get(91).openaiApiKey, 'ai-secret');
  assert.equal(ctx.saved.get(91).enabled, 0);
  assert.equal(ctx.saved.get(92).greenApiApiToken, 'other-store-token');
  assert.equal((await call(ctx, 'get /api/automation/ai-settings')).body.openaiApiKey, undefined);
});
test('modified server TypeScript parses', async () => {
  for (const path of ['server/routes.ts', 'server/storage.ts', 'server/whatsapp-service.ts']) {
    stripTypeScriptTypes(await read(path), { mode: 'transform' });
  }
});
