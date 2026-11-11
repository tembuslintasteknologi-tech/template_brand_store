export type ExportFormat = 'csv' | 'json';
export type ExportType = 'orders' | 'customers' | 'products';

export interface ExportColumn<T> {
  key: keyof T & string;
  header: string;
}

export interface ExportResult {
  filename: string;
  contentType: string;
  body: string;
}

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildCsv<T extends Record<string, unknown>>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(',');
  const lines = rows.map((row) => columns.map((column) => escapeCsvValue(row[column.key])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

export function buildExport<T extends Record<string, unknown>>(
  type: ExportType,
  format: ExportFormat,
  rows: T[],
  columns: ExportColumn<T>[],
  stamp: Date = new Date()
): ExportResult {
  const datePart = stamp.toISOString().slice(0, 10);
  const base = `${type}-${datePart}`;

  if (format === 'json') {
    return {
      filename: `${base}.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ type, generatedAt: stamp.toISOString(), rowCount: rows.length, rows }, null, 2),
    };
  }

  return {
    filename: `${base}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: '\uFEFF' + buildCsv(rows, columns),
  };
}

export function unsupportedFormatError(format: string): string {
  return `Export format "${format}" belum didukung. Yang tersedia: csv, json. Format xlsx dan pdf butuh library tambahan`;
}
