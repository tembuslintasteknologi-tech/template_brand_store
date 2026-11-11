export const logger = {
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ''),
  debug: (msg: string, meta?: any) => console.debug(`[DEBUG] ${msg}`, meta || ''),
};

export function logHttpRequest(req: any, res: any, responseTime: number) {
  console.log(`[HTTP] ${req.method} ${req.url} - ${res.status} (${responseTime}ms)`);
}

