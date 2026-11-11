import { Hono } from 'hono';
import { authMiddleware, adminOnlyMiddleware } from '../middleware/auth.js';
import {
  FinanceError,
  buildFinanceCsv,
  financialSummary,
  resolveRange,
} from '../services/finance/financeService.js';

export const financeAdminRoutes = new Hono();
financeAdminRoutes.use('*', authMiddleware, adminOnlyMiddleware);

function fail(c: any, err: any) {
  const status = err instanceof FinanceError ? err.status : 500;
  return c.json({ success: false, error: err?.message ?? 'failed' }, status as any);
}

// GET /api/v1/admin/finance/summary?from&to&format=json|csv (FIN-001)
financeAdminRoutes.get('/finance/summary', async (c) => {
  try {
    const from = c.req.query('from');
    const to = c.req.query('to');
    const summary = await financialSummary(from, to);

    if (c.req.query('format') === 'csv') {
      const range = resolveRange(from, to);
      const stamp = range.to.toISOString().slice(0, 10);
      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="finance-summary-${stamp}.csv"`);
      return c.body('\uFEFF' + buildFinanceCsv(summary));
    }

    return c.json({ success: true, data: summary });
  } catch (err: any) {
    return fail(c, err);
  }
});
