import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('GAS retries finish master sync without duplicate results; edit targets stable row ID', () => {
  const rows: any[][] = [Array(12).fill('header')];
  let masterFails = true;
  let fullReads = 0;
  const sheet = {
    getLastRow: () => rows.length,
    getDataRange: () => ({getValues: () => { fullReads++; return rows.map(r => [...r]); }}),
    getRange: (row: number, col: number, count = 1) => ({
      setValues: (values: any[][]) => values.forEach((value, index) => { rows[row - 1 + index] = [...value]; }),
      getValues: () => rows.slice(row - 1, row - 1 + count).map(r => [...r]),
      createTextFinder: (text: string) => ({matchEntireCell: () => ({findNext: () => {
        const index = rows.findIndex(r => r[col - 1] === text);
        return index < 0 ? null : {getRow: () => index + 1};
      }})}),
    }),
  };
  const context = vm.createContext({
    SpreadsheetApp: {getActiveSpreadsheet: () => ({getSheetByName: () => sheet})},
  });
  vm.runInContext(fs.readFileSync('google-apps-script.js', 'utf8'), context);
  context.withScriptLock = (callback: any) => callback();
  context.formatTimestamp = (time: string) => time;
  context.getOperatorName = (email: string) => email;
  context.bumpCacheVersion = () => {};
  context.syncMasterDataInternal = () => { if (masterFails) throw new Error('Master unavailable'); };
  const request = {sessionId: 'SO-fixed', rowIds: ['R-fixed'], timestamp: '2026-10-02', operator: 'test', location: 'a-01',
    items: [{productName: 'Test', sku: '001', batch: 'P-01', qty: 4}]};
  assert.throws(() => context.saveStockOpname(request), /Master unavailable/);
  assert.equal(rows.length, 2, 'history committed before connection/master failure');
  masterFails = false;
  const retried = context.saveStockOpname(request);
  assert.equal(retried.success, true);
  assert.equal(retried.rowIds[0], 'R-fixed');
  assert.equal(rows.length, 2);
  const reads = fullReads;
  assert.equal(context.updateEntry({rowId: 'R-fixed', newQty: 9, editTimestamp: '2026-10-02'}).success, true);
  assert.equal(rows[1][8], 9);
  assert.equal(fullReads, reads, 'quantity edit does not download the entire results sheet');
});

test('service worker keeps offline documents and RSC payloads separate', async () => {
  const listeners: Record<string, any> = {};
  const values = new Map<string, Response>();
  const key = (request: any) => typeof request === 'string' ? request : request.url;
  const cache = {
    match: async (request: any) => values.get(key(request))?.clone(),
    put: async (request: any, response: Response) => { values.set(key(request), response.clone()); },
    addAll: async (paths: string[]) => { assert.equal(new Set(paths.map(path => new URL(path, 'https://app.test').href)).size, paths.length, 'Cache.addAll rejects duplicate canonical URLs'); paths.forEach(path => values.set(path, new Response('<html><script src="/_next/static/main.js"></script></html>'))); },
  };
  let offline = false;
  const context = vm.createContext({
    self: {location: {origin: 'https://app.test'}, __OFFLINE_VERSION: 'test', __OFFLINE_ASSETS: ['/_next/static/scanner.js', '/_next/static/main.js'],
      addEventListener: (name: string, callback: any) => { listeners[name] = callback; }, skipWaiting: async () => {}, clients: {claim: async () => {}}},
    importScripts: () => {}, URL, Response, Set,
    caches: {open: async () => cache, keys: async () => [], delete: async () => true},
    fetch: async (_request: any, options: any) => {
      if (offline) throw new Error('offline');
      return new Response('RSC payload', {headers: {'Content-Type': 'text/x-component'}});
    },
  });
  vm.runInContext(fs.readFileSync('public/sw.js', 'utf8'), context);
  let installed!: Promise<void>;
  listeners.install({waitUntil: (promise: Promise<void>) => { installed = promise; }});
  await installed;
  assert.ok(values.has('https://app.test/_next/static/scanner.js'), 'lazy camera decoder cached before first use');
  offline = true;
  const read = async (url: string, isRsc: boolean) => {
    let result!: Promise<Response>;
    listeners.fetch({request: {method: 'GET', url, mode: isRsc ? 'cors' : 'navigate', headers: new Headers(isRsc ? {RSC: '1'} : {})},
      respondWith: (promise: Promise<Response>) => { result = promise; }});
    return (await result).text();
  };
  assert.match(await read('https://app.test/input?location=NEW-01', false), /html/);
  assert.equal(await read('https://app.test/input?location=NEW-01&_rsc=random', true), 'RSC payload');
});
