export interface PushResponse {
  sent: boolean;
  reason?: string;
}

export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data: Record<string, any>
): Promise<PushResponse> {
  // Mock: Jika tidak ada device token (bisa diidentifikasi dari userId), anggap gagal
  return { sent: false, reason: 'Device token not found' };
}
