# Compliance Check: UU ITE dan UU PDP

Dokumen ini adalah checklist teknis untuk tim engineering, bukan nasihat hukum. Setiap tanda `[~]`
berarti kontrol teknisnya ada tetapi masih butuh keputusan atau dokumen dari pihak brand. Jangan
menganggap template ini otomatis patuh hanya karena checklist di bawah dicentang.

Rujukan utama:

- UU 27/2022 tentang Pelindungan Data Pribadi (UU PDP).
- UU 1/2024 yang mengubah UU 11/2008 tentang Informasi dan Transaksi Elektronik (UU ITE).
- PP 71/2019 tentang Penyelenggaraan Sistem dan Transaksi Elektronik.
- GDPR (EU) 2016/679 bila ada customer yang berdomisili di Uni Eropa.

## 1. Data pribadi yang diproses

| Data | Tabel atau field | Kategori | Tujuan | Sumber |
| --- | --- | --- | --- | --- |
| Nama lengkap | `users.full_name` | identitas | pengiriman, invoice, sapaan | input user |
| Email | `users.email` | identitas dan kontak | login, reset password, notifikasi | input user |
| Nomor HP | `users.phone` | identitas dan kontak | OTP, notifikasi pengiriman | input user |
| Password hash | `users.password_hash` | kredensial | autentikasi | sistem (argon2) |
| Secret TOTP | `admin_totp.secret_encrypted` | kredensial | 2FA admin | sistem (AES-256-GCM) |
| Alamat kirim | `addresses`, `orders.shipping_address` | identitas dan lokasi | pengiriman | input user |
| Riwayat order | `orders`, `order_items` | transaksi | pemenuhan pesanan, retur, laporan | sistem |
| Log aktivitas admin | `admin_audit_log` | audit | akuntabilitas dan investigasi | sistem |
| Log HTTP dan error | stdout | teknis, bisa memuat PII | debugging dan keamanan | sistem |

Catatan: log HTTP adalah titik kebocoran yang paling sering terlewat karena retensinya panjang dan
dikirim ke pihak ketiga. Karena itu semua keluaran log lewat `src/config/logger.ts`.

## 2. Dasar pemrosesan (UU PDP Pasal 20)

| Tujuan | Dasar yang paling mungkin | Yang harus disiapkan brand |
| --- | --- | --- |
| Membuat dan mengelola akun | persetujuan atau pelaksanaan kontrak | teks persetujuan saat registrasi |
| Memproses dan mengirim pesanan | pelaksanaan kontrak | syarat dan ketentuan |
| Notifikasi transaksi | pelaksanaan kontrak | daftar kanal notifikasi |
| Marketing dan promo | persetujuan terpisah | checkbox opt-in, mekanisme opt-out |
| Pencegahan penipuan dan audit | kepentingan sah | penilaian kepentingan sah (LIA) |
| Kewajiban pajak dan akuntansi | kewajiban hukum | prosedur retensi dokumen |

Marketing tidak boleh menumpang pada persetujuan pembuatan akun. Kalau brand mengirim promo ke semua
customer tanpa opt-in terpisah, itu risiko kepatuhan, bukan sekadar pilihan produk.

## 3. Hak subjek data (UU PDP Pasal 5 sampai 13)

| Hak | Status di template | Catatan |
| --- | --- | --- |
| Informasi tentang pemrosesan | `[~]` | butuh halaman kebijakan privasi dari brand |
| Akses data sendiri | `[~]` | belum ada endpoint ekspor profil lengkap |
| Koreksi data | `[x]` | profil dan alamat bisa diubah lewat endpoint user |
| Penghapusan data | `[~]` | belum ada alur hapus akun dan anonimisasi order |
| Menarik persetujuan | `[~]` | belum ada endpoint tarik consent marketing |
| Portabilitas | `[~]` | belum ada ekspor JSON/CSV atas permintaan user |
| Keberatan atas pemrosesan otomatis | `[~]` | relevan bila nanti ada scoring atau profiling |

Order yang sudah selesai tidak boleh dihapus mentah-mentah karena bertabrakan dengan kewajiban
akuntansi. Pola yang aman: akun dinonaktifkan, data identitas dianonimkan, sementara baris transaksi
tetap ada dengan `user_id` diganti penanda anonim.

## 4. Kontrol teknis yang sudah ada

| Kontrol | Implementasi | Bukti |
| --- | --- | --- |
| Password tidak disimpan polos | argon2id di `src/routes/auth.ts` | `auth.test.ts` |
| Secret 2FA terenkripsi | AES-256-GCM di `src/services/auth/secretBox.ts` | `totp.test.ts` |
| PII diredaksi di log | `src/services/security/piiMasker.ts` | `piiMasking.test.ts` |
| Endpoint admin dibatasi | `adminIpAllowlist` di `src/middleware/security.ts` | `adminIpAllowlist.test.ts` |
| Otorisasi per scope | `requirePermission` dan 23 scope di `src/services/auth/permissions.ts` | `adminPermissions.test.ts` |
| Jejak audit aksi admin | `src/services/admin/auditLog.ts` | `adminCore.test.ts` |
| Rate limit per scope | `RATE_LIMITS` di `src/middleware/security.ts` | `security.test.ts` |
| Header keamanan dan CSP | `securityHeadersMiddleware` | `security.test.ts` |
| Proteksi CSRF | middleware CSRF | `csrf.test.ts` |
| Sanitasi input | middleware sanitization | `sanitization.test.ts` |
| Password admin default ditandai | `src/services/auth/adminPasswordPolicy.ts` | `adminPasswordPolicy.test.ts` |
| Backup dan restore | `scripts/backup-db.ps1`, `scripts/restore-db.ps1` | `docs/OPERATIONS.md` |

## 5. Celah yang butuh keputusan manusia

Semua baris di bawah ini tidak bisa ditutup oleh kode saja:

- `[~]` Kebijakan privasi yang menyebut kategori data, dasar pemrosesan, retensi, dan kontak DPO.
- `[~]` Syarat dan ketentuan yang memuat batasan tanggung jawab dan mekanisme sengketa.
- `[~]` Consent banner dan cookie consent bila storefront memakai analytics pihak ketiga.
- `[~]` Perjanjian pemrosesan data (DPA) dengan vendor: payment gateway, log aggregator, object
  storage, dan penyedia pengiriman.
- `[~]` Job retensi otomatis. Saat ini tidak ada purge otomatis untuk log, keranjang terbengkalai,
  atau sesi kedaluwarsa.
- `[~]` Penunjukan penanggung jawab pelindungan data dan kanal kontak resmi.
- `[~]` Prosedur notifikasi insiden. UU PDP Pasal 46 mewajibkan pemberitahuan ke subjek data dan
  lembaga dalam 3x24 jam sejak diketahui.
- `[~]` Penilaian transfer data lintas negara bila hosting, CDN, atau vendor berada di luar Indonesia.
- `[~]` Pemeriksaan GDPR bila ada customer Uni Eropa: dasar pemrosesan, hak subjek, dan perwakilan
  di EU.

## 6. Alur insiden kebocoran data

1. Identifikasi: apa yang bocor, berapa banyak subjek data, dan sejak kapan.
2. Hentikan: cabut kredensial, putus akses, matikan endpoint yang bocor.
3. Kumpulkan bukti: potongan log dengan `x-correlation-id`, waktu mulai, dan cakupan.
4. Nilai risiko: data identitas, kredensial, atau data transaksi. Kredensial memperbesar risiko.
5. Notifikasi ke subjek data dan lembaga sesuai batas 3x24 jam. Draft sudah disiapkan brand, bukan
   ditulis mendadak saat insiden.
6. Perbaikan akar masalah dan uji ulang sebelum menutup insiden.
7. Catat seluruh kronologi di log insiden, terpisah dari log aplikasi.

## 7. UU ITE yang relevan untuk fitur toko

| Pasal | Kaitan | Kontrol di template |
| --- | --- | --- |
| Pasal 26 | persetujuan penggunaan informasi elektronik | syarat layanan dan consent |
| Pasal 27 | konten terlarang | moderasi ulasan dan konten user |
| Pasal 28 | berita bohong dan ujaran kebencian | moderasi, tombol lapor |
| Pasal 30 | akses ilegal | autentikasi, rate limit, IP allowlist |
| Pasal 32 | perubahan dan transfer data tanpa hak | RBAC, audit log |

Moderasi ulasan: template menyimpan ulasan apa adanya. Brand wajib punya prosedur takedown bila ada
laporan konten yang melanggar Pasal 27 atau 28.

## 8. Ringkasan status

| Area | Status | Alasan |
| --- | --- | --- |
| Kontrol teknis dasar | `[x]` | hashing, enkripsi, RBAC, audit, masking, rate limit |
| Dokumen legal | `[~]` | ditulis dan disetujui brand |
| Retensi dan penghapusan | `[~]` | butuh job dan kebijakan retensi |
| Notifikasi insiden | `[~]` | butuh prosedur dan penanggung jawab |
| Kepatuhan penuh | `[ ]` | belum bisa diklaim tanpa review legal dan DPA vendor |

Template ini menyediakan bahan untuk audit, bukan hasil audit. Sebelum go live, minta review hukum
dan simpan bukti review tersebut di folder kepatuhan brand.
