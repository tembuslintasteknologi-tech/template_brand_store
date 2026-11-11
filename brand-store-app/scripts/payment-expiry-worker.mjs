import { expirePendingOrders } from '../src/services/payment/paymentExpiry.ts';

const now = new Date();
try {
  const expired = await expirePendingOrders(now);
  console.log(
    JSON.stringify(
      {
        checkedAt: now.toISOString(),
        expiredCount: expired.length,
        orders: expired,
        database: Boolean(process.env.DATABASE_URL),
      },
      null,
      2
    )
  );
  process.exit(0);
} catch (err) {
  console.error('expiry sweep failed:', err?.message ?? err);
  process.exit(1);
}
