import test from 'node:test';
import assert from 'node:assert';
import {
  getCart,
  addCartItem,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  mergeCarts,
  quoteCart,
  calculateShippingRates,
} from '../services/cartService.js';

test('Cart & Checkout Service', async (t) => {
  await t.test('manage cart items and clear cart (CRT-001)', async () => {
    const cartId = 'test-user-1';
    clearCart(cartId);

    let cart = getCart(cartId);
    assert.strictEqual(cart.items.length, 0);

    // Add item (without variant ID for pure unit test or mock)
    cart = await addCartItem(cartId, {
      productId: 'prod-1',
      quantity: 2,
      price: 50000,
      name: 'Test Product',
    });

    assert.strictEqual(cart.items.length, 1);
    assert.strictEqual(cart.items[0].quantity, 2);
    assert.strictEqual(cart.items[0].price, 50000);

    // Update quantity
    cart = await updateCartItemQuantity(cartId, 'prod-1', undefined, 5);
    assert.strictEqual(cart.items[0].quantity, 5);

    // Remove item
    cart = removeCartItem(cartId, 'prod-1', undefined);
    assert.strictEqual(cart.items.length, 0);

    // Clear cart
    await addCartItem(cartId, { productId: 'prod-2', quantity: 1, price: 10000, name: 'P2' });
    cart = clearCart(cartId);
    assert.strictEqual(cart.items.length, 0);
  });

  await t.test('guest cart session and merge on login (CRT-002, CRT-003)', async () => {
    const guestId = 'guest-session-abc';
    const userId = 'user-xyz';

    clearCart(guestId);
    clearCart(userId);

    await addCartItem(guestId, { productId: 'p-guest', quantity: 2, price: 25000, name: 'Guest Item' });
    await addCartItem(userId, { productId: 'p-user', quantity: 1, price: 50000, name: 'User Item' });

    const mergedCart = await mergeCarts(guestId, userId);
    assert.strictEqual(mergedCart.items.length, 2);
    assert.strictEqual(getCart(guestId).items.length, 0); // guest cart cleaned/removed
  });

  await t.test('quote cart with promo, tax, and shipping calculation (CRT-006)', () => {
    const items = [
      { productId: 'p1', quantity: 2, price: 100000, name: 'Item 1' }, // subtotal 200,000
    ];

    const quote = quoteCart({
      items,
      promos: [
        {
          code: 'DISCOUNT10',
          discountType: 'percentage',
          discountValue: 10,
          startDate: new Date(Date.now() - 86400000),
          endDate: new Date(Date.now() + 86400000),
          isActive: true,
        },
      ],
      taxPercent: 11,
      shippingAmount: 15000,
    });

    assert.strictEqual(quote.subtotal, 200000);
    assert.strictEqual(quote.discountTotal, 20000); // 10% of 200k
    assert.strictEqual(quote.taxableAmount, 180000); // 200k - 20k
    assert.strictEqual(quote.taxAmount, 19800); // 11% of 180k = 19,800
    assert.strictEqual(quote.shippingAmount, 15000);
    assert.strictEqual(quote.grandTotal, 180000 + 19800 + 15000); // 214,800
    assert.deepStrictEqual(quote.appliedPromos, ['DISCOUNT10']);
  });

  await t.test('calculate shipping rates', async () => {
    const rates = await calculateShippingRates('Bandung', 2);
    assert.strictEqual(rates.destinationCity, 'Bandung');
    assert.ok(rates.services.length > 0);
    assert.ok(rates.services[0].cost > 0);
  });
});
