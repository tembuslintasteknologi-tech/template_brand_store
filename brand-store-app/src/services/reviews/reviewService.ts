import { z } from 'zod';
import { db } from '../../db/index.js';
import { orderItems, orders, reviewHelpfulVotes, reviewReports, reviews, users } from '../../db/schema.js';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { recordAdminAction } from '../admin/auditLog.js';

export class ReviewError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ReviewError';
    this.status = status;
  }
}

export const REVIEW_SORTS = ['recent', 'highest', 'lowest', 'helpful'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const PAID_ORDER_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];

export const reviewSchema = z.object({
  productId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  imageUrls: z.array(z.string().url()).max(5).optional(),
});

export interface ReviewEligibilityInput {
  purchased: boolean;
  alreadyReviewed: boolean;
}

export interface ReviewEligibility {
  allowed: boolean;
  verifiedPurchase: boolean;
  reason?: string;
}

/**
 * One review per customer per product. Writing is only allowed after a paid
 * order that contains the product (verified purchase).
 */
export function canWriteReview(input: ReviewEligibilityInput): ReviewEligibility {
  if (input.alreadyReviewed) {
    return { allowed: false, verifiedPurchase: input.purchased, reason: 'already_reviewed' };
  }
  if (!input.purchased) {
    return { allowed: false, verifiedPurchase: false, reason: 'not_purchased' };
  }
  return { allowed: true, verifiedPurchase: true };
}

export interface RatingSummary {
  count: number;
  average: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function summarizeRatings(ratings: number[]): RatingSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  for (const raw of ratings) {
    const rating = Math.round(Number(raw));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
    distribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
    total += rating;
  }
  const count = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  return {
    count,
    average: count === 0 ? 0 : Math.round((total / count) * 10) / 10,
    distribution,
  };
}

export interface ReviewView {
  rating: number;
  helpfulCount?: number;
  createdAt: string | Date;
}

export function sortReviews<T extends ReviewView>(rows: T[], sort: ReviewSort): T[] {
  const copy = [...rows];
  const time = (row: T) => new Date(row.createdAt).getTime();
  switch (sort) {
    case 'highest':
      return copy.sort((a, b) => b.rating - a.rating || time(b) - time(a));
    case 'lowest':
      return copy.sort((a, b) => a.rating - b.rating || time(b) - time(a));
    case 'helpful':
      return copy.sort((a, b) => (b.helpfulCount ?? 0) - (a.helpfulCount ?? 0) || time(b) - time(a));
    case 'recent':
    default:
      return copy.sort((a, b) => time(b) - time(a));
  }
}

export function parseReviewSort(value: string | undefined | null): ReviewSort {
  const candidate = String(value ?? 'recent') as ReviewSort;
  return (REVIEW_SORTS as readonly string[]).includes(candidate) ? candidate : 'recent';
}

export function isPublicReview(review: { isVisible?: boolean | null } | null | undefined): boolean {
  return Boolean(review && review.isVisible !== false);
}

export async function hasPurchasedProduct(userId: string, productId: string, orderId?: string): Promise<boolean> {
  const conditions = [
    eq(orders.customerId, userId as any),
    eq(orderItems.productId, productId as any),
    inArray(orders.status, PAID_ORDER_STATUSES),
  ];
  if (orderId) conditions.push(eq(orders.id, orderId as any));

  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

export async function createReview(userId: string, input: unknown) {
  const parsed = reviewSchema.parse(input);

  const purchased = await hasPurchasedProduct(userId, parsed.productId, parsed.orderId);
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.userId, userId as any), eq(reviews.productId, parsed.productId as any)))
    .limit(1);

  const eligibility = canWriteReview({ purchased, alreadyReviewed: Boolean(existing) });
  if (!eligibility.allowed) {
    const message =
      eligibility.reason === 'already_reviewed'
        ? 'Kamu sudah pernah mengulas produk ini'
        : 'Review hanya bisa ditulis setelah produk dibeli dan pesanan dibayar';
    throw new ReviewError(message, eligibility.reason === 'already_reviewed' ? 409 : 403);
  }

  const now = new Date();
  const [row] = await db
    .insert(reviews)
    .values({
      productId: parsed.productId as any,
      userId: userId as any,
      orderId: (parsed.orderId ?? null) as any,
      rating: parsed.rating,
      comment: parsed.comment ?? null,
      imageUrls: (parsed.imageUrls ?? []) as any,
      isVerifiedPurchase: eligibility.verifiedPurchase,
      isVisible: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return row;
}

async function helpfulCountsFor(reviewIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (reviewIds.length === 0) return map;
  const rows = await db
    .select({ reviewId: reviewHelpfulVotes.reviewId, total: sql<number>`count(*)::int` })
    .from(reviewHelpfulVotes)
    .where(inArray(reviewHelpfulVotes.reviewId, reviewIds as any[]))
    .groupBy(reviewHelpfulVotes.reviewId);
  for (const row of rows) map.set(String(row.reviewId), Number(row.total ?? 0));
  return map;
}

export async function listProductReviews(productId: string, options: { sort?: string; limit?: number } = {}) {
  const sort = parseReviewSort(options.sort);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const rows = await db
    .select({
      id: reviews.id,
      productId: reviews.productId,
      userId: reviews.userId,
      rating: reviews.rating,
      comment: reviews.comment,
      imageUrls: reviews.imageUrls,
      isVerifiedPurchase: reviews.isVerifiedPurchase,
      adminReply: reviews.adminReply,
      adminRepliedAt: reviews.adminRepliedAt,
      isVisible: reviews.isVisible,
      createdAt: reviews.createdAt,
      authorName: users.fullName,
    })
    .from(reviews)
    .leftJoin(users, eq(users.id, reviews.userId))
    .where(and(eq(reviews.productId, productId as any), eq(reviews.isVisible, true)));

  const counts = await helpfulCountsFor(rows.map((row) => String(row.id)));
  const withCounts = rows.map((row) => ({
    ...row,
    authorName: row.authorName ? String(row.authorName).split(' ')[0] : 'Pelanggan',
    helpfulCount: counts.get(String(row.id)) ?? 0,
  }));

  const sorted = sortReviews(withCounts, sort).slice(0, limit);
  const summary = summarizeRatings(rows.map((row) => row.rating));

  return { reviews: sorted, summary };
}

export async function markReviewHelpful(userId: string, reviewId: string) {
  const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId as any)).limit(1);
  if (!review || review.isVisible === false) {
    throw new ReviewError('Review tidak ditemukan', 404);
  }

  await db
    .insert(reviewHelpfulVotes)
    .values({ reviewId: reviewId as any, userId: userId as any })
    .onConflictDoNothing();

  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviewHelpfulVotes)
    .where(eq(reviewHelpfulVotes.reviewId, reviewId as any));

  return { reviewId, helpfulCount: Number(row?.total ?? 0) };
}

export async function reportReview(userId: string, reviewId: string, input: unknown) {
  const parsed = z
    .object({ reason: z.string().min(3).max(100), description: z.string().max(1000).optional() })
    .parse(input);

  const [review] = await db.select().from(reviews).where(eq(reviews.id, reviewId as any)).limit(1);
  if (!review) throw new ReviewError('Review tidak ditemukan', 404);

  const [row] = await db
    .insert(reviewReports)
    .values({
      reviewId: reviewId as any,
      reportedBy: userId as any,
      reason: parsed.reason,
      description: parsed.description ?? null,
      status: 'pending',
    })
    .returning();

  return row;
}

export async function listReviewsForModeration(options: { status?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = await db
    .select({
      id: reviews.id,
      productId: reviews.productId,
      userId: reviews.userId,
      rating: reviews.rating,
      comment: reviews.comment,
      isVisible: reviews.isVisible,
      isVerifiedPurchase: reviews.isVerifiedPurchase,
      adminReply: reviews.adminReply,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .orderBy(desc(reviews.createdAt))
    .limit(limit);

  if (!options.status) return rows;
  const visible = options.status === 'visible';
  return rows.filter((row) => row.isVisible === visible);
}

export async function setReviewVisibility(actorId: string, reviewId: string, input: unknown) {
  const parsed = z.object({ isVisible: z.boolean(), reason: z.string().max(500).optional() }).parse(input);

  const [existing] = await db.select().from(reviews).where(eq(reviews.id, reviewId as any)).limit(1);
  if (!existing) throw new ReviewError('Review tidak ditemukan', 404);

  const [row] = await db
    .update(reviews)
    .set({ isVisible: parsed.isVisible, updatedAt: new Date() })
    .where(eq(reviews.id, reviewId as any))
    .returning();

  await recordAdminAction({
    actorId,
    action: parsed.isVisible ? 'review.unhide' : 'review.hide',
    targetType: 'review',
    targetId: reviewId,
    metadata: { reason: parsed.reason ?? null, productId: String(existing.productId) },
  });

  return row;
}

export async function replyToReview(actorId: string, reviewId: string, input: unknown) {
  const parsed = z.object({ adminReply: z.string().min(1).max(2000) }).parse(input);

  const [existing] = await db.select().from(reviews).where(eq(reviews.id, reviewId as any)).limit(1);
  if (!existing) throw new ReviewError('Review tidak ditemukan', 404);

  const [row] = await db
    .update(reviews)
    .set({
      adminReply: parsed.adminReply,
      adminRepliedAt: new Date(),
      adminReplyBy: actorId as any,
      updatedAt: new Date(),
    })
    .where(eq(reviews.id, reviewId as any))
    .returning();

  await recordAdminAction({
    actorId,
    action: 'review.reply',
    targetType: 'review',
    targetId: reviewId,
    metadata: { productId: String(existing.productId) },
  });

  return row;
}

export async function listReviewReports(options: { status?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const status = options.status ?? 'pending';
  return db
    .select()
    .from(reviewReports)
    .where(eq(reviewReports.status, status))
    .orderBy(desc(reviewReports.createdAt))
    .limit(limit);
}

export async function resolveReviewReport(actorId: string, reportId: string, input: unknown) {
  const parsed = z.object({ status: z.enum(['resolved', 'dismissed']), hideReview: z.boolean().optional() }).parse(input);

  const [existing] = await db.select().from(reviewReports).where(eq(reviewReports.id, reportId as any)).limit(1);
  if (!existing) throw new ReviewError('Laporan review tidak ditemukan', 404);

  const [row] = await db
    .update(reviewReports)
    .set({ status: parsed.status, resolvedAt: new Date(), resolvedBy: actorId as any })
    .where(eq(reviewReports.id, reportId as any))
    .returning();

  if (parsed.hideReview) {
    await db
      .update(reviews)
      .set({ isVisible: false, updatedAt: new Date() })
      .where(eq(reviews.id, existing.reviewId as any));
  }

  await recordAdminAction({
    actorId,
    action: 'review_report.resolve',
    targetType: 'review_report',
    targetId: reportId,
    metadata: { status: parsed.status, hideReview: Boolean(parsed.hideReview) },
  });

  return row;
}
