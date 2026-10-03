import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

process.env.NEXT_PUBLIC_APPS_SCRIPT_URL = 'https://example.test/api';
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });
Object.defineProperty(globalThis, 'window', { value: new EventTarget() });
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true } });
let calls: string[] = [];
let failWrite = false;
let failHistory = false;
let oldBackend = false;
let masterTimeouts = 0;
const posted: any[] = [];
globalThis.fetch = (async (_url: any, init: any) => {
  const body = JSON.parse(init.body);
  calls.push(body.action);
  if (body.action === 'getAllMasterData' && masterTimeouts-- > 0) throw new DOMException('signal timed out', 'TimeoutError');
  if (body.action === 'getAllMasterData') return Response.json({success: true, products: [
    { location: 'A-01', productName: 'Test', sku: '0001', batch: 'P-01', barcode: '00123' },
    { location: 'B-01', productName: 'Test', sku: '0001', batch: 'P-01', barcode: '00123' },
  ]});
  if (body.action === 'getHistory') return Response.json(failHistory ? {success: false} : {success: true, history: []});
  if (body.action === 'getSyncCapabilities') return Response.json({success: !oldBackend, stableWriteIds: !oldBackend});
  posted.push(body);
  if (failWrite) throw new Error('Connection lost after send');
  return Response.json({success: true});
}) as typeof fetch;

test('offline snapshot, durable writes, ordered retries and refresh protection', async () => {
  const db = await import('../src/lib/localDb');
  const api = await import('../src/lib/api');
  masterTimeouts = 1;
  const progress: any[] = [];
  await db.syncAllData(update => progress.push(update));
  assert.equal(calls.filter(action => action === 'getAllMasterData').length, 2, 'retry a timed-out read automatically');
  assert.ok(progress.some(update => update.step.includes('Mencoba kembali')));
  assert.equal(progress[0].percent, 10, 'progress snapshots must not mutate when a later stage runs');
  assert.equal((await db.getProductsLocal(' a-01 '))?.[0].sku, '0001');
  assert.equal((await db.getProductsLocal('B-01'))?.length, 1, 'same SKU in two locations must survive');
  storage.set('testOffline', 'true');
  const count = calls.length;
  assert.deepEqual(await api.getProductsApi('NEW-01'), {success: true, products: []});
  assert.deepEqual(await api.searchLocationsApi('UNKNOWN'), {success: true, locations: []});
  assert.equal(calls.length, count, 'offline misses must not call GAS');
  const saved = await api.saveStockOpnameApi('old-id', 'user@test', 'new-01', new Date().toISOString(), [
    {productName: 'New', sku: '0002', batch: 'P-02', qty: 3}
  ]);
  assert.equal((await db.getPendingWrites()).length, 1);
  assert.equal((await db.getHistoryLocal())[0].rowId, saved.rowIds![0]);
  await api.updateEntryApi(saved.rowIds![0], saved.sessionId!, 7, new Date().toISOString(), {batch: 'P-03', location: undefined, sku: undefined, formula: '1x7=7'});
  assert.equal((await db.getPendingWrites()).length, 2);
  assert.equal((await db.getHistoryLocal())[0].qty, 7);
  assert.equal((await db.getHistoryLocal())[0].location, 'NEW-01', 'editing without moving must retain the location');
  assert.equal((await db.getHistoryLocal())[0].sku, '0002', 'unspecified fields cannot erase cached product details');
  assert.equal((await db.getProductsLocal('NEW-01'))?.[0].batch, 'P-03');
  assert.equal((await api.deleteEntryApi(saved.rowIds![0])).success, false);
  await api.updateEntryApi(saved.rowIds![0], saved.sessionId!, 7, new Date().toISOString(), {batch: 'P-04', formula: undefined});
  assert.equal((await db.getHistoryLocal())[0].formula, '1x7=7', 'a batch-only edit retains the count formula');
  assert.equal((await db.getProductsLocal('NEW-01'))?.[0].batch, 'P-04');
  storage.set('testOffline', 'false');
  // Downloading an older snapshot must not erase queued input or edits.
  await db.syncAllData();
  assert.equal((await db.getHistoryLocal())[0].qty, 7);
  assert.equal((await db.getProductsLocal('NEW-01'))?.[0].batch, 'P-04');
  failHistory = true;
  await assert.rejects(db.syncAllData());
  assert.equal((await db.getHistoryLocal())[0].qty, 7, 'failed sync keeps old snapshot');
  failHistory = false;
  oldBackend = true;
  await api.flushPendingWrites();
  assert.equal(posted.length, 0, 'do not send stable IDs to incompatible backend');
  assert.equal((await db.getPendingWrites()).length, 3);
  oldBackend = false;
  failWrite = true;
  await api.flushPendingWrites();
  assert.equal(posted.length, 1);
  assert.equal((await db.getPendingWrites()).length, 3);
  assert.match((await db.getPendingWrites())[0].error!, /Connection lost/);
  failWrite = false;
  await api.flushPendingWrites();
  assert.deepEqual(posted.map(p => p.action), ['saveStockOpname', 'saveStockOpname', 'updateEntry', 'updateEntry']);
  assert.deepEqual(posted[0].rowIds, posted[1].rowIds, 'retry uses identical IDs');
  assert.equal((await db.getPendingWrites()).length, 0);
  assert.equal((await db.getAllLocationsLocal()).some(l => l.locationCode === 'NEW-01'), true);
});
