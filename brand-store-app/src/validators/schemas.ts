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
  })).min(1),
  shippingAddress: z.object({
    recipientName: z.string(),
    phone: z.string(),
    addressLine: z.string(),
    city: z.string(),
    province: z.string(),
    postalCode: z.string(),
  }),
});
