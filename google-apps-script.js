// Google Apps Script for Stock Opname Backend
// Deploy this as a Web App with "Anyone" access

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

function generateShortId(prefix, length) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var result = prefix;
  for (var i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatTimestamp(isoString) {
  var date = new Date(isoString);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd MMM yyyy HH:mm");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLocation(value) {
  return normalizeText(value).toUpperCase();
}

function getOperatorName(email) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      return String(data[i][1]).trim().split(" ")[0];
    }
  }
  return email;
}

// ──────────────────────────────────────────────────────────────
// LOCKING — reduced timeout, fail fast for concurrent users
// ──────────────────────────────────────────────────────────────

function withScriptLock(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { success: false, message: "Server sibuk, coba lagi dalam beberapa detik" };
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

// ──────────────────────────────────────────────────────────────
// CACHE LAYER
// ──────────────────────────────────────────────────────────────

var CACHE_TTL = 30;

function cacheVersion() {
  return PropertiesService.getScriptProperties().getProperty("CV") || "1";
}

function bumpCacheVersion() {
  PropertiesService.getScriptProperties().setProperty("CV", String(Date.now()));
}

function cacheKey(prefix, q) {
  return prefix + ":" + cacheVersion() + ":" + Utilities.base64EncodeWebSafe(String(q || "")).slice(0, 100);
}

function cacheGet(key) {
  var raw = CacheService.getScriptCache().get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function cachePut(key, obj, ttl) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(obj), ttl || CACHE_TTL);
  } catch (e) { /* non-critical */ }
}

// ──────────────────────────────────────────────────────────────
// MASTER DATA — single read helper
// ──────────────────────────────────────────────────────────────

function readMasterData() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data").getDataRange().getValues();
}

// ──────────────────────────────────────────────────────────────
// ROUTER
// ──────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var result;

    switch (action) {
      case "login":           result = login(data.email, data.password); break;
      case "getProducts":     result = getProducts(data.locationCode); break;
      case "saveStockOpname": result = saveStockOpname(data); break;
      case "getHistory":      result = getHistory(data.operator, data.filter, data.allOperators); break;
      case "updateEntry":     result = updateEntry(data); break;
      case "deleteProduct":   result = deleteProduct(data.locationCode, data.sku, data.batch); break;
      case "deleteEntry":     result = deleteEntry(data.rowId); break;
      case "addMasterProduct": result = addMasterProduct(data); break;
      case "lookupBarcode":   result = lookupBarcode(data.barcode); break;
      case "searchProducts":  result = searchProducts(data.query); break;
      case "searchLocations": result = searchLocations(data.query); break;
      case "warmupCache":     result = warmupCache(data); break;
      case "getAllLocations":  result = getAllLocations(); break;
      case "getAllProducts":   result = getAllProducts(); break;
      case "moveProducts":    result = moveProducts(data); break;
      case "searchProductsGlobal": result = searchProductsGlobal(data.query); break;
      default:                result = { success: false, message: "Unknown action" };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ──────────────────────────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────────────────────────

function login(email, password) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === email && data[i][2] === password) {
      return { success: true, user: { email: data[i][0], name: data[i][1], role: data[i][3] } };
    }
  }
  return { success: false, message: "Email atau password salah" };
}

// ──────────────────────────────────────────────────────────────
// READ — no lock needed, cached where beneficial
// ──────────────────────────────────────────────────────────────

function lookupBarcode(barcode) {
  var data = readMasterData();
  var target = normalizeText(barcode);
  for (var i = 1; i < data.length; i++) {
    if (normalizeText(data[i][4]) === target) {
      return { success: true, product: { productName: data[i][1], sku: data[i][2], batch: data[i][3], barcode: data[i][4] } };
    }
  }
  return { success: false, message: "Produk tidak ditemukan untuk barcode: " + barcode };
}

function getProducts(locationCode) {
  var ck = cacheKey("gp", locationCode);
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = readMasterData();
  var products = [];
  var target = normalizeLocation(locationCode);
  for (var i = 1; i < data.length; i++) {
    if (normalizeLocation(data[i][0]) === target) {
      products.push({ productName: data[i][1], sku: data[i][2], batch: data[i][3], barcode: data[i][4] || "" });
    }
  }
  var resp = products.length > 0
    ? { success: true, products: products }
    : { success: false, message: "Lokasi tidak ditemukan" };
  if (products.length > 0) cachePut(ck, resp, CACHE_TTL);
  return resp;
}

function searchProducts(query, preloadedData) {
  var q = normalizeText(query).toLowerCase();
  if (!q) return { success: true, products: [] };

  var ck = cacheKey("sp", q);
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = preloadedData || readMasterData();
  var results = [];
  var seen = {};
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][1]).toLowerCase();
    var sku = String(data[i][2]);
    var batch = String(data[i][3] || "");
    var key = sku + "||" + batch;
    if (name.indexOf(q) !== -1 && !seen[key]) {
      seen[key] = true;
      results.push({ productName: data[i][1], sku: data[i][2], batch: batch, barcode: data[i][4] || "" });
      if (results.length >= 10) break;
    }
  }
  var resp = { success: true, products: results };
  cachePut(ck, resp, CACHE_TTL);
  return resp;
}

function searchLocations(query, preloadedData) {
  var q = normalizeText(query).toLowerCase();
  if (!q) return { success: true, locations: [] };

  var ck = cacheKey("sl", q);
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = preloadedData || readMasterData();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var loc = String(data[i][0]).trim();
    if (loc) map[loc] = (map[loc] || 0) + 1;
  }
  var results = [];
  var keys = Object.keys(map).sort();
  for (var j = 0; j < keys.length; j++) {
    if (keys[j].toLowerCase().indexOf(q) !== -1) {
      results.push({ locationCode: keys[j], productCount: map[keys[j]] });
      if (results.length >= 15) break;
    }
  }
  var resp = { success: true, locations: results };
  cachePut(ck, resp, CACHE_TTL);
  return resp;
}

function getHistory(operator, filter, allOperators) {
  var ck = cacheKey("gh", (allOperators ? "ALL" : operator) + "|" + (filter || "all"));
  var cached = cacheGet(ck);
  if (cached) return cached;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
  var data = sheet.getDataRange().getValues();
  var history = [];
  var operatorName = allOperators ? null : getOperatorName(operator);
  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    if (!allOperators && data[i][3] !== operatorName) continue;
    var ts = new Date(data[i][2]);
    var valid = !isNaN(ts.getTime());
    if (valid) {
      if (filter === "today" && ts.toDateString() !== now.toDateString()) continue;
      if (filter === "week" && ts < new Date(now.getTime() - 7 * 86400000)) continue;
      if (filter === "month" && ts < new Date(now.getTime() - 30 * 86400000)) continue;
    }
    history.push({
      sessionId: data[i][0], rowId: data[i][1], timestamp: data[i][2],
      operator: data[i][3], location: data[i][4], productName: data[i][5],
      sku: data[i][6], batch: data[i][7], qty: data[i][8],
      edited: data[i][9], editTimestamp: data[i][10], formula: data[i][11] || ""
    });
  }
  var resp = { success: true, history: history };
  cachePut(ck, resp, 10);
  return resp;
}

// ──────────────────────────────────────────────────────────────
// WARMUP — reads Master Data ONCE, passes to search helpers
// ──────────────────────────────────────────────────────────────

function warmupCache(payload) {
  try {
    payload = payload || {};
    var seedLoc = normalizeText(payload.locationQuery || "").toLowerCase();
    var seedProd = normalizeText(payload.productQuery || "").toLowerCase();

    var data = readMasterData();

    var qLoc = [], qProd = [];

    if (seedLoc) {
      for (var a = 1; a <= Math.min(3, seedLoc.length); a++) qLoc.push(seedLoc.slice(0, a));
    }
    if (seedProd) {
      for (var b = 1; b <= Math.min(3, seedProd.length); b++) qProd.push(seedProd.slice(0, b));
    }

    if (qLoc.length === 0 || qProd.length === 0) {
      var seenL = {}, seenP = {};
      for (var c = 1; c < data.length && (qLoc.length < 4 || qProd.length < 4); c++) {
        var l = normalizeText(data[c][0]).toLowerCase();
        if (l && !seenL[l] && qLoc.length < 4) { seenL[l] = 1; qLoc.push(l.slice(0, 2)); }
        var p = normalizeText(data[c][1]).toLowerCase();
        if (p && !seenP[p] && qProd.length < 4) { seenP[p] = 1; qProd.push(p.slice(0, 2)); }
      }
    }

    var uL = {}, uP = {};
    for (var d = 0; d < qLoc.length; d++) {
      var ql = qLoc[d]; if (!ql || uL[ql]) continue; uL[ql] = 1;
      searchLocations(ql, data);
    }
    for (var f = 0; f < qProd.length; f++) {
      var qp = qProd[f]; if (!qp || uP[qp]) continue; uP[qp] = 1;
      searchProducts(qp, data);
    }

    return { success: true, warmed: { locations: Object.keys(uL).length, products: Object.keys(uP).length } };
  } catch (error) {
    return { success: false, message: "Warmup gagal: " + error };
  }
}

// ──────────────────────────────────────────────────────────────
// WRITE — uses lock, minimal hold time
// ──────────────────────────────────────────────────────────────

function addMasterProduct(data) {
  return withScriptLock(function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
    var mdData = sheet.getDataRange().getValues();
    var loc = normalizeLocation(data.locationCode);
    var sku = normalizeText(data.sku);
    var batch = normalizeText(data.batch || "");
    var skuForSheet = sku ? "'" + sku : "";
    var batchForSheet = batch ? "'" + batch : "";

    // Check if already exists
    for (var i = 1; i < mdData.length; i++) {
      if (normalizeLocation(mdData[i][0]) === loc && normalizeText(mdData[i][2]) === sku && normalizeText(mdData[i][3]) === batch) {
        return { success: false, message: "Produk dengan SKU dan Batch yang sama sudah ada di lokasi ini" };
      }
    }

    sheet.appendRow([loc, data.productName || "", skuForSheet, batchForSheet, data.barcode || ""]);
    bumpCacheVersion();
    return { success: true, message: "Produk berhasil ditambahkan ke Master Data" };
  });
}

function deleteProduct(locationCode, sku, batch) {
  return withScriptLock(function() { return deleteProductInternal(locationCode, sku, batch); });
}

function deleteProductInternal(locationCode, sku, batch) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  var data = sheet.getDataRange().getValues();
  var tLoc = normalizeLocation(locationCode);
  var tSku = normalizeText(sku);
  var tBatch = normalizeText(batch || "");

  var count = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (normalizeLocation(data[i][0]) === tLoc && normalizeText(data[i][2]) === tSku && normalizeText(data[i][3]) === tBatch) {
      sheet.deleteRow(i + 1);
      count++;
      break; // Only delete exact match (location + SKU + batch)
    }
  }
  if (count === 0) return { success: false, message: "Produk tidak ditemukan di lokasi tersebut" };
  bumpCacheVersion();
  return { success: true, message: "Produk berhasil dihapus dari lokasi" };
}

function saveStockOpname(data) {
  return withScriptLock(function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return { success: false, message: "Tidak ada item untuk disimpan" };
    }

    var sessionId = generateShortId("SO-", 6);
    var timestamp = formatTimestamp(data.timestamp);
    var operatorName = getOperatorName(data.operator);
    var loc = normalizeLocation(data.location);

    var rows = data.items.map(function(item) {
      return [sessionId, generateShortId("R-", 6), timestamp, operatorName, loc,
              item.productName, item.sku ? "'" + item.sku : "", item.batch ? "'" + item.batch : "", item.qty, "No", "", item.formula || ""];
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 12).setValues(rows);
    syncMasterDataInternal(loc, data.items);
    bumpCacheVersion();
    // Kembalikan sessionId + rowId asli agar aplikasi menyimpan ID server
    // (hapus/edit entri baru langsung menemukan barisnya di sheet).
    var rowIds = rows.map(function (r) { return r[1]; });
    return { success: true, message: "Stock opname berhasil disimpan", sessionId: sessionId, rowIds: rowIds };
  });
}

function syncMasterData(locationCode, items) {
  return withScriptLock(function() { return syncMasterDataInternal(locationCode, items); });
}

function syncMasterDataInternal(locationCode, items) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
  var data = sheet.getDataRange().getValues();
  var loc = normalizeLocation(locationCode);

  // Track existing products by SKU + Batch combination (not just SKU)
  var existing = {};
  for (var i = 1; i < data.length; i++) {
    if (normalizeLocation(data[i][0]) === loc) {
      var key = normalizeText(String(data[i][2])) + "||" + normalizeText(String(data[i][3]));
      existing[key] = true;
    }
  }

  var newRows = [];
  var seen = {};
  (items || []).forEach(function(item) {
    var sku = normalizeText(item.sku);
    var batch = normalizeText(item.batch || "");
    var key = sku + "||" + batch;
    if (!sku || existing[key] || seen[key]) return;
    seen[key] = true;
    newRows.push([loc, item.productName || "", "'" + sku, item.batch ? "'" + item.batch : "", item.barcode || ""]);
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
    bumpCacheVersion();
  }
}

function updateEntry(data) {
  return withScriptLock(function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
    var values = sheet.getDataRange().getValues();

    for (var i = 1; i < values.length; i++) {
      if (values[i][1] === data.rowId) {
        // Capture OLD values before updating (for Master Data sync)
        var oldLocation = normalizeLocation(values[i][4]);
        var oldProductName = normalizeText(values[i][5]);
        var oldSku = normalizeText(String(values[i][6]));
        var oldBatch = normalizeText(String(values[i][7]));

        var row = values[i].slice();
        if (data.location !== undefined) row[4] = normalizeLocation(data.location);
        if (data.productName !== undefined) row[5] = data.productName;
        if (data.sku !== undefined) row[6] = data.sku ? "'" + data.sku : "";
        if (data.batch !== undefined) row[7] = data.batch ? "'" + data.batch : "";
        row[8] = data.newQty;
        row[9] = "Yes";
        row[10] = formatTimestamp(data.editTimestamp);
        if (data.formula !== undefined) row[11] = data.formula || "";
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);

        // Sync changes to Master Data if location, productName, sku, or batch changed
        var newLocation = normalizeLocation(data.location !== undefined ? data.location : oldLocation);
        var newProductName = normalizeText(data.productName !== undefined ? data.productName : oldProductName);
        var newSku = normalizeText(data.sku !== undefined ? data.sku : oldSku);
        var newBatch = normalizeText(data.batch !== undefined ? data.batch : oldBatch);

        if (newLocation !== oldLocation || newProductName !== oldProductName || newSku !== oldSku || newBatch !== oldBatch) {
          var mdSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
          var mdData = mdSheet.getDataRange().getValues();
          for (var j = 1; j < mdData.length; j++) {
            if (normalizeLocation(mdData[j][0]) === oldLocation &&
                normalizeText(String(mdData[j][2])) === oldSku &&
                normalizeText(String(mdData[j][3])) === oldBatch) {
              // Update the Master Data row with new values
              if (newLocation !== oldLocation) mdSheet.getRange(j + 1, 1).setValue(newLocation); // col A = Location
              mdSheet.getRange(j + 1, 2).setValue(newProductName); // col B = Product Name
              mdSheet.getRange(j + 1, 3).setValue(newSku ? "'" + newSku : "");         // col C = SKU
              mdSheet.getRange(j + 1, 4).setValue(newBatch ? "'" + newBatch : "");       // col D = Batch
              break; // Only update exact match
            }
          }
        }

        bumpCacheVersion();
        return { success: true, message: "Entry berhasil diupdate" };
      }
    }
    return { success: false, message: "Entry tidak ditemukan" };
  });
}

function deleteEntry(rowId) {
  return withScriptLock(function() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock Opname Results");
    var values = sheet.getDataRange().getValues();

    for (var i = 1; i < values.length; i++) {
      if (values[i][1] === rowId) {
        // Capture product info before deleting the row
        var location = normalizeLocation(values[i][4]);
        var sku = normalizeText(String(values[i][6]));
        var batch = normalizeText(String(values[i][7]));

        // Delete from Stock Opname Results
        sheet.deleteRow(i + 1);

        // Also delete from Master Data (specific location + SKU + batch)
        if (location && sku) {
          var mdSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
          var mdData = mdSheet.getDataRange().getValues();
          for (var j = mdData.length - 1; j >= 1; j--) {
            if (normalizeLocation(mdData[j][0]) === location &&
                normalizeText(String(mdData[j][2])) === sku &&
                normalizeText(String(mdData[j][3])) === batch) {
              mdSheet.deleteRow(j + 1);
              break; // Only delete the exact match
            }
          }
        }

        bumpCacheVersion();
        return { success: true, message: "Entry berhasil dihapus" };
      }
    }
    return { success: false, message: "Entry tidak ditemukan" };
  });
}

// ──────────────────────────────────────────────────────────────
// BULK READ — return ALL data for client-side filtering (fast UX)
// ──────────────────────────────────────────────────────────────

function getAllLocations() {
  var ck = cacheKey("allLoc", "v1");
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = readMasterData();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var loc = String(data[i][0]).trim();
    if (loc) map[loc] = (map[loc] || 0) + 1;
  }
  var locations = [];
  var keys = Object.keys(map).sort();
  for (var j = 0; j < keys.length; j++) {
    locations.push({ locationCode: keys[j], productCount: map[keys[j]] });
  }
  var resp = { success: true, locations: locations };
  cachePut(ck, resp, 60);
  return resp;
}

function getAllProducts() {
  var ck = cacheKey("allProd", "v1");
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = readMasterData();
  var products = [];
  var seen = {};
  for (var i = 1; i < data.length; i++) {
    var sku = normalizeText(data[i][2]);
    var batch = normalizeText(data[i][3] || "");
    var key = sku + "||" + batch;
    if (sku && !seen[key]) {
      seen[key] = true;
      products.push({ productName: data[i][1], sku: sku, batch: batch, barcode: data[i][4] || "" });
    }
  }
  var resp = { success: true, products: products };
  cachePut(ck, resp, 60);
  return resp;
}

// ──────────────────────────────────────────────────────────────
// SEARCH PRODUCTS GLOBAL — with location info for cross-location search
// ──────────────────────────────────────────────────────────────

function searchProductsGlobal(query) {
  var q = normalizeText(query).toLowerCase();
  if (!q || q.length < 2) return { success: true, products: [] };

  var ck = cacheKey("spg", q);
  var cached = cacheGet(ck);
  if (cached) return cached;

  var data = readMasterData();
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][1]).toLowerCase();
    var sku = String(data[i][2]).toLowerCase();
    var batch = String(data[i][3] || "").toLowerCase();
    if (name.indexOf(q) !== -1 || sku.indexOf(q) !== -1 || batch.indexOf(q) !== -1) {
      results.push({
        location: String(data[i][0]).trim(),
        productName: data[i][1],
        sku: data[i][2],
        batch: String(data[i][3] || ""),
        barcode: data[i][4] || ""
      });
      if (results.length >= 30) break;
    }
  }
  var resp = { success: true, products: results };
  cachePut(ck, resp, CACHE_TTL);
  return resp;
}

// ──────────────────────────────────────────────────────────────
// MOVE PRODUCTS — bulk transfer products between locations
// ──────────────────────────────────────────────────────────────

function moveProducts(data) {
  return withScriptLock(function() {
    var fromLoc = normalizeLocation(data.fromLocation);
    var toLoc = normalizeLocation(data.toLocation);
    if (!fromLoc || !toLoc) return { success: false, message: "Lokasi asal dan tujuan harus diisi" };
    if (fromLoc === toLoc) return { success: false, message: "Lokasi asal dan tujuan tidak boleh sama" };

    var items = data.items; // array of { sku, batch }  — if empty/null, move ALL
    var moveAll = !items || items.length === 0;

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Master Data");
    var mdData = sheet.getDataRange().getValues();

    // Build set of items to move (for selective move)
    var moveSet = {};
    if (!moveAll) {
      for (var m = 0; m < items.length; m++) {
        var mk = normalizeText(String(items[m].sku)) + "||" + normalizeText(String(items[m].batch || ""));
        moveSet[mk] = true;
      }
    }

    // Build set of existing products at target location to avoid duplicates
    var existsAtTarget = {};
    for (var t = 1; t < mdData.length; t++) {
      if (normalizeLocation(mdData[t][0]) === toLoc) {
        var tk = normalizeText(String(mdData[t][2])) + "||" + normalizeText(String(mdData[t][3]));
        existsAtTarget[tk] = true;
      }
    }

    // Update rows: change location from source to target
    var movedCount = 0;
    var mergedCount = 0;
    var rowsToDelete = []; // rows to delete after loop (merged duplicates)
    for (var i = 1; i < mdData.length; i++) {
      if (normalizeLocation(mdData[i][0]) !== fromLoc) continue;
      var sku = normalizeText(String(mdData[i][2]));
      var batch = normalizeText(String(mdData[i][3]));
      var key = sku + "||" + batch;

      if (!moveAll && !moveSet[key]) continue; // not selected

      if (existsAtTarget[key]) {
        // Duplicate at target — delete source row (merge)
        rowsToDelete.push(i + 1); // sheet row (1-based)
        mergedCount++;
        continue;
      }

      sheet.getRange(i + 1, 1).setValue(toLoc); // Update column A (Location)
      existsAtTarget[key] = true; // mark as exists now
      movedCount++;
    }

    // Delete merged rows from bottom to top to keep indices valid
    rowsToDelete.sort(function(a, b) { return b - a; });
    for (var d = 0; d < rowsToDelete.length; d++) {
      sheet.deleteRow(rowsToDelete[d]);
    }

    if (movedCount === 0 && mergedCount === 0) {
      return { success: false, message: "Tidak ada produk yang ditemukan di lokasi asal" };
    }

    bumpCacheVersion();
    var msg = movedCount + " produk berhasil dipindah ke " + toLoc;
    if (mergedCount > 0) msg += " (" + mergedCount + " digabung karena sudah ada di tujuan)";
    return { success: true, message: msg, moved: movedCount, merged: mergedCount };
  });
}
