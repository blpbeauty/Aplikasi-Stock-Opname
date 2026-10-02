## Pembaruan scan cepat dan offline (2 Oktober 2026)

1. Ganti isi project Apps Script dengan **google-apps-script.js** di repository ini. Gunakan **Deploy → Manage deployments → Edit → New version → Deploy** supaya URL `/exec` tetap sama.
2. Build dan terbitkan frontend terbaru dengan `npm run build`. Build juga menghasilkan `public/offline-assets.js`; file ini dan `public/sw.js` harus ikut tersedia di hosting.
3. Buka aplikasi secara online melalui HTTPS (atau localhost untuk pengujian), login, lalu tunggu unduhan data selesai. Untuk perangkat yang pernah memakai versi lama, gunakan sinkronisasi ulang di profil bila perlu.
4. Pada Scan, masukkan/scan kode lokasi baru, pilih **Gunakan lokasi**, tambahkan produk, dan simpan hasil. Master Data mendapat lokasi bersama produk saat antrean terkirim. Lokasi kosong tanpa produk belum dibuat sebagai baris master.
5. Tekan **Uji offline** pada indikator di atas halaman. Cari lokasi yang sudah diunduh, buat input baru, lalu edit dari Riwayat. Jumlah antrean harus bertambah. Muat ulang untuk mengecek persistensi.
6. Tekan **Akhiri uji offline**. Antrean otomatis terkirim; kegagalan tetap terlihat dan bisa dicoba lagi lewat **Kirim ulang**.
7. Untuk menguji offline sesungguhnya, gunakan build produksi (`npm run build`, `npm start`), tunggu service worker selesai aktif, matikan jaringan lalu buka ulang halaman Scan/Input/Riwayat. Tombol Uji offline mensimulasikan koneksi data, bukan mematikan jaringan browser.

Simpan/edit mengonfirmasi **tersimpan di perangkat**, bukan langsung tersimpan di Google Sheets. Jangan menghapus data situs/browser sebelum antrean habis. Login pertama, unduhan awal, hapus, dan pemindahan produk massal masih memerlukan koneksi. Kamera harus diuji pada perangkat tujuan dengan izin kamera dan HTTPS.

Backend lama ditolak sebelum antrean dikirim karena belum mendukung ID tetap. Data antrean tetap disimpan ketika deployment belum diperbarui. Refresh yang gagal mempertahankan cache terakhir; refresh berhasil juga mempertahankan input/edit yang belum terkirim.

Pengujian lokal: `npm test` (IndexedDB tiruan, respons jaringan tiruan, serta stub layanan Apps Script), `npm run build`.

---

# Google Apps Script Backend Setup

This document provides detailed instructions for setting up the Google Apps Script backend for the Stock Opname application.

## Step 1: Create Google Sheets

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it "Stock Opname Database" (or your preferred name)

## Step 2: Create Required Sheets

Create 3 sheets in your spreadsheet:

### Sheet 1: Users
This sheet stores user credentials for login.

**Column Headers (Row 1):**
- A1: `email`
- B1: `name`
- C1: `password`
- D1: `role`

**Sample Data (Row 2):**
- A2: `admin@example.com`
- B2: `Admin User`
- C2: `admin123`
- D2: `admin`

**Sample Data (Row 3):**
- A3: `user@example.com`
- B3: `Regular User`
- C3: `user123`
- D3: `user`

### Sheet 2: Products
This sheet stores product data by location. **This sheet is automatically synchronized** after each stock opname.

**Column Headers (Row 1):**
- A1: `location`
- B1: `productName`
- C1: `sku`
- D1: `batch`

**Sample Data (Row 2-4):**
```
A01-B01-C01 | Produk A | SKU001 | BATCH001
A01-B01-C01 | Produk B | SKU002 | BATCH002
A02-B01-C01 | Produk C | SKU003 | BATCH003
```

**Auto-Sync Behavior:**
- When operators save stock opname results, this sheet is automatically updated
- Products with qty > 0 remain in the sheet
- Products with qty = 0 or not filled are removed from the sheet
- New products discovered during stock opname are added to the sheet

### Sheet 3: StockOpname
This sheet stores all stock opname entries.

**Column Headers (Row 1):**
- A1: `sessionId`
- B1: `rowId`
- C1: `timestamp`
- D1: `operator`
- E1: `location`
- F1: `productName`
- G1: `sku`
- H1: `batch`
- I1: `qty`
- J1: `edited`
- K1: `editTimestamp`

*Note: This sheet will be populated automatically when users save stock opname data.*

## Step 3: Setup Apps Script

1. In your Google Sheets, click **Extensions** > **Apps Script**
2. Delete any default code in the editor
3. Copy and paste the complete code from `google-apps-script.js` (see below)
4. Click **Save** (disk icon)
5. Name the project "Stock Opname API"

## Step 4: Deploy as Web App

1. Click **Deploy** > **New deployment**
2. Click the gear icon ⚙️ next to "Select type"
3. Select **Web app**
4. Fill in the form:
   - **Description**: `Stock Opname API v1`
   - **Execute as**: `Me (your@email.com)`
   - **Who has access**: `Anyone`
5. Click **Deploy**
6. Review and authorize the permissions:
   - Click **Authorize access**
   - Select your Google account
   - Click **Advanced** (if you see a warning)
   - Click **Go to Stock Opname API (unsafe)**
   - Click **Allow**
7. Copy the **Web app URL** (it will look like: `https://script.google.com/macros/s/[SCRIPT_ID]/exec`)

## Step 5: Update Frontend Configuration

1. Open your `.env.local` file in the Next.js project
2. Update the `NEXT_PUBLIC_APPS_SCRIPT_URL` with your Web app URL:
   ```
   NEXT_PUBLIC_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
   ```
3. Save the file
4. Restart your development server

## Step 6: Test the Integration

1. Start the Next.js app: `npm run dev`
2. Go to `http://localhost:3000`
3. Try logging in with the test credentials:
   - Email: `admin@example.com`
   - Password: `admin123`
4. If login succeeds, the integration is working!

## Troubleshooting

### Login fails with "CORS error"
- Make sure you deployed the Apps Script as "Anyone" can access
- Clear browser cache and try again

### "Cannot read property of undefined" error
- Check that all sheet names are spelled correctly (Users, Products, StockOpname)
- Verify that column headers match exactly (case-sensitive)

### Products not found for a location
- Verify that the location code in the Products sheet matches exactly
- Location codes are case-sensitive

### Data not saving
- Check the Apps Script execution logs:
  1. Open Apps Script editor
  2. Click **Executions** (clock icon on left)
  3. Look for errors in recent executions

## API Endpoints Reference

The backend supports the following actions:

### 1. Login
```json
POST {APPS_SCRIPT_URL}
{
  "action": "login",
  "email": "user@example.com",
  "password": "password123"
}
```

### 2. Get Products
```json
POST {APPS_SCRIPT_URL}
{
  "action": "getProducts",
  "locationCode": "A01-B01-C01"
}
```

### 3. Save Stock Opname
```json
POST {APPS_SCRIPT_URL}
{
  "action": "saveStockOpname",
  "sessionId": "user@example.com_1234567890",
  "operator": "user@example.com",
  "location": "A01-B01-C01",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "items": [
    {
      "productName": "Produk A",
      "sku": "SKU001",
      "batch": "BATCH001",
      "qty": 10,
      "isNew": false
    },
    {
      "productName": "Produk D (Baru)",
      "sku": "SKU004",
      "batch": "BATCH004",
      "qty": 5,
      "isNew": true
    }
  ]
}
```

**Note:** This endpoint also automatically synchronizes the Products (Master Data) sheet:
- Products with `isNew: true` are added to Master Data
- Products not in the items list are removed from Master Data for that location

### 4. Get History
```json
POST {APPS_SCRIPT_URL}
{
  "action": "getHistory",
  "operator": "user@example.com",
  "filter": "all" // or "today", "week", "month"
}
```

### 5. Update Entry
```json
POST {APPS_SCRIPT_URL}
{
  "action": "updateEntry",
  "rowId": "uuid-here",
  "sessionId": "session-id-here",
  "newQty": 15,
  "editTimestamp": "2024-01-01T12:30:00.000Z"
}
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **Password Storage**: Passwords are stored in plain text in the spreadsheet. For production, implement proper password hashing (e.g., using Apps Script's `Utilities.computeDigest()`).

2. **Authentication**: Currently using simple email/password. Consider implementing:
   - JWT tokens
   - OAuth 2.0
   - Session expiration

3. **Data Validation**: Add input validation in Apps Script to prevent malicious data.

4. **Access Control**: Restrict sheet access to authorized users only.

5. **HTTPS**: Apps Script web apps are served over HTTPS by default, which is good!

## Updating the Backend

If you need to make changes to the backend:

1. Edit the code in Apps Script editor
2. Click **Save**
3. Click **Deploy** > **Manage deployments**
4. Click the pencil icon ✏️ next to your active deployment
5. Update the **Version** to "New version"
6. Click **Deploy**

The Web app URL will remain the same, so you don't need to update your frontend configuration.

## Monitoring and Logs

To view execution logs:

1. Open Apps Script editor
2. Click **Executions** (clock icon) on the left sidebar
3. View recent executions, errors, and execution times
4. Click on any execution to see detailed logs

## Backup

To backup your data:

1. **Spreadsheet Backup**: 
   - File > Make a copy
   - Or File > Version history

2. **Apps Script Backup**:
   - Download the script: Click the three dots menu > Download as JSON

Regular backups are recommended!
