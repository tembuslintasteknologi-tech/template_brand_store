import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const productSchema = z.object({
  title: z.string().min(3),
  slug: z.string().min(3),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  basePrice: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  sku: z.string().optional(),
  stock: z.number().int().nonnegative(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  images: z.array(z.string()).optional(),
});

export const orderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    // BR-009: cart items carry the branch the customer picked. Absent means the legacy pusat
    // pool, which keeps old clients working until the storefront always sends a branch.
    branchId: z.string().uuid().optional(),
    fulfillmentMode: z.enum(['ondemand', 'aggregator']).optional(),
  })).min(1),
  shippingAddress: z.object({
    recipientName: z.string(),
    phone: z.string(),
    addressLine: z.string(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
    // BR-010: optional so a client that knows the pin can send it. `user_addresses` has no
    // coordinate column yet, so this is the only source for the ondemand distance check.
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
});

/**
 * BR-010 checkout body. It is the order body plus the shipping selection. `selectedMode` and
 * `selectedService` stay plain strings here so the service can answer with its own error codes
 * (SHIPPING_SERVICE_REQUIRED, SHIPPING_SERVICE_NOT_AVAILABLE) instead of a zod blob.
 */
export const checkoutSchema = orderSchema.extend({
  branchId: z.string().uuid().optional(),
  addressId: z.string().uuid().optional(),
  selectedMode: z.string().optional(),
  selectedService: z.string().optional(),
  weightGrams: z.number().int().positive().optional(),
});
