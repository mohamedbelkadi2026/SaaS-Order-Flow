import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const { ExpressRelaisClient } = await import('data:text/javascript;base64,' +
  Buffer.from(stripTypeScriptTypes(await read('server/integrations/express-relais.ts'), { mode: 'transform' })).toString('base64'));
const source = await read('server/services/carrier-service.ts');
const branch = source.indexOf('// ── Express Relais AIO');
const start = source.indexOf('await client.createOrder({', branch);
const end = source.indexOf('\n      });', start);
const expression = source.slice(start + 'await client.createOrder('.length, end) + '\n      }';

test('Express Relais creation sends documented opening enum for both choices in one JSON request', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [canOpen, expected] of [[true, 'ALLOWED'], [false, 'NOT_ALLOWED']]) {
      const calls = [];
      globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return Response.json({ codeApi: 5000 });
      };
      // Evaluate the actual carrier-service mapping, then serialize it through
      // the actual adapter. No real shipment or network request is created.
      const order = vm.runInNewContext('(' + expression + ')', {
        input: { orderNumber: 'TEST-OPEN', orderId: 1, canOpen,
          city: 'Casablanca', address: 'Test address', totalPrice: 11900,
          productName: 'Test product', note: 'Test note' },
        pickupCity: 'Casablanca', pickupAddress: 'Test pickup',
        pickupContact: 'Test sender', pickupPhone: '00212600000000',
        firstName: 'Test', lastName: 'Recipient', recipientPhone: '00212600000001',
      });
      await new ExpressRelaisClient({ login: 'test', password: 'test' }).createOrder(order);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url.pathname, '/createAioOrder');
      assert.equal(calls[0].init.method, 'POST');
      assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
      const body = JSON.parse(calls[0].init.body);
      assert.equal(body.openParcel, expected);
      assert.equal(Object.hasOwn(body, 'allowOpenParcel'), false);
      assert.equal(body.cashOnDelivery, 119);
      assert.equal(body.idParcelClient, 'TEST-OPEN');
      assert.equal(body.mobileRecipient, '00212600000001');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
