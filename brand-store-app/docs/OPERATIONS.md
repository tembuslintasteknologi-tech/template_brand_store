# Operasional: Observability, Keamanan, dan Backup

Dokumen ini menjelaskan cara menjalankan template di production: sinyal yang harus dipantau, ambang
alert, proteksi endpoint admin, penanganan PII di log, terminasi TLS, dan prosedur backup/restore.
Angka di sini adalah default kode, bukan janji SLA. Brand boleh mengubahnya lewat environment.

## 1. Four golden signals

Metrik dihitung in-process tanpa dependensi tambahan. Implementasi ada di
`src/services/observability/metrics.ts`, middleware di `src/middleware/metrics.ts`, dan endpoint di
`src/routes/metrics.ts`. Data hilang saat proses restart, jadi untuk histori panjang scrape endpoint
ini ke Prometheus atau collector lain.

| Sinyal | Isi | Sumber |
| --- | --- | --- |
| Traffic | jumlah request total dan per route | `totals.requests`, `routes[].count` |
| Latency | p50, p95, p99, max, histogram bucket | `latency.*` |
| Errors | jumlah dan rasio 5xx total maupun per route | `totals.errors`, `totals.errorRate` |
| Saturation | heap terpakai, heap total, RSS | `saturation.*` |

### Endpoint

- `GET /metrics` mengembalikan snapshot lengkap termasuk `alerts`.
- `GET /metrics/alerts` mengembalikan keputusan alert saja (`ok`, `warning`, atau `critical`).

Bucket latency: 50, 100, 250, 500, 1000, 2500, 5000, 10000 ms.

### Ambang alert default

| Environment | Default | Arti |
| --- | --- | --- |
| `ALERT_ERROR_RATE` | `0.05` | rasio 5xx di atas 5 persen memicu alert |
| `ALERT_P95_LATENCY_MS` | `1500` | p95 di atas 1,5 detik memicu alert |
| `ALERT_MEMORY_USED_PERCENT` | `90` | heap terpakai di atas 90 persen memicu alert |
| `ALERT_MIN_SAMPLES` | `20` | alert error dan latency tidak dievaluasi sebelum 20 request |

Aturan severity:

- `critical` bila nilai melewati dua kali ambang (error rate dan latency), atau heap melewati ambang
  plus 5 poin persen.
- `warning` bila melewati ambang tetapi belum dua kali.

### Siapa yang membaca alert

Endpoint ini tidak mengirim notifikasi sendiri. Cara paling murah: cron atau uptime monitor memanggil
`/metrics/alerts` tiap menit, lalu meneruskan ke Slack atau email on-call saat `status` bukan `ok`.
Jangan pasang alert pada error rate saat traffic masih di bawah `ALERT_MIN_SAMPLES`, karena satu
request gagal dari lima akan terlihat seperti 20 persen error.

### Akses endpoint metrik

| Kondisi | Perilaku |
| --- | --- |
| `METRICS_TOKEN` diisi | wajib header `x-metrics-token` atau `Authorization: Bearer <token>` |
| Kosong dan `NODE_ENV=production` | endpoint mengembalikan 503 `METRICS_DISABLED` |
| Kosong dan bukan production | terbuka, supaya `curl localhost:3000/metrics` berguna saat development |

Isi `METRICS_TOKEN` dengan nilai acak panjang (contoh: `openssl rand -hex 32`). Endpoint ini
membocorkan pola route dan volume request, jadi jangan pernah dibiarkan terbuka di internet.

## 2. PII masking di log

`src/config/logger.ts` memakai `src/services/security/piiMasker.ts` untuk semua pesan dan metadata:

- Email menjadi `b***@example.com`.
- Nomor HP Indonesia menyisakan empat digit awal dan tiga digit akhir.
- NIK dan nomor kartu menyisakan empat digit terakhir.
- Query string dengan key sensitif (`token`, `password`, `otp`, `api_key`, `email`, dan sejenisnya)
  diganti `***` sebelum URL dicetak.
- Metadata objek disaring rekursif sampai kedalaman 4, lalu dipotong dengan `[truncated]`.

Aturan untuk developer: jangan memanggil `console.log` langsung untuk data user. Pakai `logger` dari
`src/config/logger.ts`. Kalau butuh field baru di log, cek dulu apakah field itu masuk `SENSITIVE_KEYS`
atau berbentuk PII.

## 3. IP allowlist endpoint admin

Semua path `/api/v1/admin/*` melewati `adminIpAllowlist()` (`src/middleware/security.ts`).

- `ADMIN_IP_ALLOWLIST` kosong berarti allow all. Ini default yang aman untuk development dan test,
  tetapi berarti proteksi belum aktif.
- Isi dengan daftar dipisah koma: `10.0.0.0/8, 203.0.113.7, ::1`.
- `*` juga berarti allow all.
- Entri bisa IPv4 exact, CIDR IPv4, atau IPv6 exact. IPv4 yang dikirim proxy sebagai
  `::ffff:10.0.0.1` dinormalisasi lebih dulu.
- IP diambil dari `x-forwarded-for` (hop pertama), lalu `cf-connecting-ip`, lalu `x-real-ip`.

Di produksi, isi variabel ini dengan IP kantor atau IP VPN. Kalau proxy di depan API tidak menimpa
`x-forwarded-for`, klien bisa memalsukan header itu. Pastikan reverse proxy menulis ulang header
tersebut, bukan meneruskan nilai dari klien.

Contoh nginx:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
```

## 4. TLS 1.3

Aplikasi tidak menangani sertifikat. TLS diterminasi di reverse proxy atau load balancer. Konfigurasi
nginx yang hanya mengizinkan TLS 1.2 dan 1.3, dengan 1.3 diprioritaskan:

```nginx
server {
    listen 443 ssl;
    http2 on;

    ssl_certificate     /etc/letsencrypt/live/store.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/store.example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;

    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Verifikasi setelah deploy:

```bash
openssl s_client -connect store.example.com:443 -tls1_3 -servername store.example.com </dev/null | grep Protocol
curl -sI https://store.example.com/health | findstr /i strict-transport
```

`securityHeadersMiddleware` sudah mengirim HSTS dan CSP dari sisi aplikasi, tetapi HSTS hanya berarti
kalau response benar-benar datang lewat HTTPS.

## 5. Enkripsi field sensitif

Secret TOTP disimpan terenkripsi AES-256-GCM di `src/services/auth/secretBox.ts` dengan kunci dari
`TOTP_ENCRYPTION_KEY`. Enrollment ditolak kalau kunci tidak ada, tidak ada fallback ke kunci default.

Kunci harus 32 byte, ditulis sebagai 64 karakter hex atau base64. Contoh membuat kunci:

```bash
openssl rand -hex 32
```

Rotasi kunci memerlukan dekripsi ulang dengan kunci lama lalu enkripsi dengan kunci baru. Simpan kunci
lama selama masa transisi, dan jangan pernah commit nilainya.

## 6. Backup dan restore

Dua skrip ada di `brand-store-app/scripts/`:

```powershell
# Backup ke folder default .\backups
.\scripts\backup-db.ps1 -DatabaseUrl "postgres://user:pass@host:5432/brand_store"

# Backup ke folder tertentu, simpan 14 hari
.\scripts\backup-db.ps1 -DatabaseUrl "..." -OutputDir "D:\backup\brand" -RetainDays 14

# Restore, minta konfirmasi dulu
.\scripts\restore-db.ps1 -DatabaseUrl "..." -File ".\backups\brand_store-20261119-020000.dump"

# Restore tanpa prompt (hanya untuk pipeline yang sudah punya approval)
.\scripts\restore-db.ps1 -DatabaseUrl "..." -File "..." -Force
```

Keduanya memanggil `pg_dump` dan `pg_restore` dari PATH, jadi PostgreSQL client harus terpasang di
mesin yang menjalankannya. Format dump adalah custom (`-Fc`) supaya bisa direstore selektif dengan
`pg_restore -t nama_tabel`.

### Jadwal yang disarankan

| Lingkungan | Frekuensi | Retensi | Lokasi |
| --- | --- | --- | --- |
| Production | harian 02.00 | 30 hari | object storage terpisah dari DB |
| Staging | harian | 7 hari | disk lokal |
| Development | manual sebelum migrasi besar | tidak wajib | disk lokal |

Jadwal belum dipasang oleh aplikasi. Pasang lewat cron, Windows Task Scheduler, atau job di platform
deploy. Contoh cron:

```cron
0 2 * * * cd /srv/brand-store-app && ./scripts/backup-db.ps1 -OutputDir /var/backups/brand -RetainDays 30 >> /var/log/brand-backup.log 2>&1
```

Di Windows, `pwsh -File .\scripts\backup-db.ps1 -OutputDir D:\backup\brand`.

### Bukti restore wajib

Backup yang belum pernah direstore belum terbukti. Minimal sebulan sekali:

1. Buat database kosong baru.
2. Restore dump terbaru ke database itu.
3. Jalankan `SELECT count(*)` pada tabel inti (`users`, `products`, `orders`).
4. Catat tanggal, ukuran dump, dan hasil hitungan di log operasional.

## 7. Runbook singkat saat alert menyala

1. Buka `/metrics/alerts` dan catat sinyal yang menyala.
2. Error rate tinggi: cek `routes[]` dengan `errorRate` tertinggi, lalu korelasikan dengan log
   `[HTTP]` memakai `x-correlation-id` atau `trace=<id>` dari header `x-trace-id`.
3. p95 latency tinggi: cek route paling sibuk, lalu lihat apakah ada query lambat atau Redis down.
   Rate limiter gagal terbuka saat Redis mati, jadi lonjakan traffic bisa terlihat sebagai latensi.
4. Saturasi heap tinggi: restart proses adalah tindakan sementara. Cari kebocoran (listener, cache
   tanpa batas, koneksi DB yang tidak ditutup) sebelum heap naik lagi.
5. Setelah pulih, catat penyebab dan tindakan di log insiden. Jangan menurunkan ambang alert hanya
   supaya dashboard hijau.

## 8. Distributed tracing (OpenTelemetry)

Span tracing ada di `src/services/observability/tracing.ts`, middleware di `src/middleware/tracing.ts`.
Setiap request membuka span server `METHOD /path` dan mengembalikan dua header:

| Header | Isi |
| --- | --- |
| `x-trace-id` | 32 karakter hex, trace ID span server |
| `traceparent` | format W3C `00-<trace-id>-<span-id>-<flags>` |

`traceparent` dari upstream diekstrak lebih dulu, jadi request yang lewat gateway tetap satu trace
dengan gateway, bukan trace baru. Header yang rusak diabaikan dan diganti trace baru. Trace ID juga
ditempel di baris log `[HTTP] ... trace=<id>`, jadi satu `grep` cukup untuk melihat semua log request
itu.

### Environment

| Env | Default | Arti |
| --- | --- | --- |
| `OTEL_ENABLED` | `false` | `true` mengaktifkan export span ke collector |
| `OTEL_SERVICE_NAME` | `brand-store-api` | nilai `service.name` di resource |
| `OTEL_SERVICE_VERSION` | `2.0.0` | nilai `service.version` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | base URL OTLP HTTP, `/v1/traces` ditambahkan otomatis |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | kosong | override penuh, menang atas base URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | kosong | header collector, format `key=value,key2=value2` |
| `OTEL_TRACES_SAMPLER_ARG` | `1` | rasio sampling root span, 0 sampai 1 |

Walau `OTEL_ENABLED=false`, span tetap dibuat tetapi tidak diekspor. Tujuannya supaya `x-trace-id`
dan korelasi log tetap jalan tanpa collector. Export span menambah biaya CPU dan jaringan, jadi di
produksi mulai dari rasio sampel kecil (misalnya `0.1`) lalu naikkan bila perlu.

### Jaeger lokal

```powershell
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one:latest
$env:OTEL_ENABLED="true"
npm run dev
```

Buka `http://localhost:16686`, pilih service `brand-store-api`, lalu cari trace memakai ID dari
header `x-trace-id`. Span yang masih di buffer di-flush saat proses menerima `SIGINT` atau `SIGTERM`.

### Batas yang diketahui

- Span hanya menutup level HTTP. Query database dan panggilan HTTP keluar belum diinstrumentasi
  otomatis, jadi durasi di dalam span masih gabungan.
- Collector hanya menerima trace. Metrik dan log belum dikirim lewat OTLP; keduanya masih lewat
  `/metrics` dan stdout.

## 9. Yang belum ada

- Metrik tidak persisten. Kalau butuh histori, scrape ke Prometheus.
- Backup terjadwal belum aktif sampai job cron atau Task Scheduler dipasang di server brand.
- Alert belum mengirim notifikasi sendiri.
