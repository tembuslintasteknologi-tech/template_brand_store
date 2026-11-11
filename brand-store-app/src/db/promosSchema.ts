// promosSchema.ts -- re-exports canonical promo/flash-sale definitions from schema.ts
// to avoid duplicate table registrations with Drizzle. All canonical definitions
// live in schema.ts so drizzle.config.ts picks them up in one place.
export {
  promos,
  promoUsages,
  flashSales,
  flashSaleItems,
} from './schema.js';
