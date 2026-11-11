/**
 * ORD-001 / ORD-002: human readable order numbers in the form INV/YYYY/MM/NNNNNN.
 */
export function formatOrderNumber(sequence: number, date: Date = new Date()): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('sequence must be a positive integer');
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const padded = String(sequence).padStart(6, '0');
  return `INV/${year}/${month}/${padded}`;
}

export function orderNumberPrefix(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `INV/${year}/${month}/`;
}

/** Parses the trailing sequence from an order number, or returns null. */
export function parseOrderNumber(value: string): { period: string; sequence: number } | null {
  const match = /^INV\/(\d{4})\/(\d{2})\/(\d{6})$/.exec(value);
  if (!match) return null;
  return { period: `${match[1]}/${match[2]}`, sequence: parseInt(match[3], 10) };
}
