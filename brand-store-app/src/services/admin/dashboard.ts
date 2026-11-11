import { db } from '../../db/index.js';
import { orders } from '../../db/schema.js';
import { sql } from 'drizzle-orm';

export interface DailyPoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface ChartSeries {
  days: number;
  from: string;
  to: string;
  revenue: DailyPoint[];
  totals: { orders: number; revenue: number; averageOrderValue: number };
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fillDailySeries(
  rows: Array<{ date: string; orders: number | string; revenue: number | string }>,
  from: Date,
  to: Date
): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const row of rows) {
    const key = String(row.date).slice(0, 10);
    byDate.set(key, {
      date: key,
      orders: Number(row.orders ?? 0),
      revenue: Number(row.revenue ?? 0),
    });
  }

  const series: DailyPoint[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  while (cursor.getTime() <= end.getTime()) {
    const key = isoDay(cursor);
    series.push(byDate.get(key) ?? { date: key, orders: 0, revenue: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
}

export async function buildChartSeries(days = 7, now: Date = new Date()): Promise<ChartSeries> {
  const windowDays = Math.min(Math.max(days, 1), 90);
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (windowDays - 1));

  const result = await db.execute(
    sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
               count(*)::int as orders,
               coalesce(sum(total_amount), 0)::text as revenue
        from orders
        where created_at >= ${from.toISOString()}::timestamp
        group by 1
        order by 1`
  );

  const rows = (Array.isArray(result) ? result : (result as any)?.rows ?? []) as Array<{
    date: string;
    orders: number | string;
    revenue: number | string;
  }>;

  const revenue = fillDailySeries(rows, from, to);
  const totalOrders = revenue.reduce((sum, point) => sum + point.orders, 0);
  const totalRevenue = revenue.reduce((sum, point) => sum + point.revenue, 0);

  return {
    days: windowDays,
    from: isoDay(from),
    to: isoDay(to),
    revenue,
    totals: {
      orders: totalOrders,
      revenue: totalRevenue,
      averageOrderValue: totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
    },
  };
}
