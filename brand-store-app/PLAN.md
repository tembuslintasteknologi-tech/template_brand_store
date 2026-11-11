Rencana implementasi Push Notification:
1. Menambahkan firebase-admin ke package.json.
2. Membuat service baru src/services/notifications/pushService.ts untuk Firebase FCM.
3. Menambah field device_token di tabel users atau tabel terpisah user_devices.
4. Mengintegrasikan pushService ke notify() di notificationService.ts.
