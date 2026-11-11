export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  price: number;
  name: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
}

const memoryCarts = new Map<string, CartItem[]>();

export const getCart = (cartId: string): Cart => {
  const items = memoryCarts.get(cartId) || [];
  return { id: cartId, items: [...items] };
};

export const clearCart = (cartId: string): Cart => {
  memoryCarts.set(cartId, []);
  return { id: cartId, items: [] };
};

export const addCartItem = async (cartId: string, item: CartItem): Promise<Cart> => {
  const items = memoryCarts.get(cartId) || [];
  const existingIndex = items.findIndex(
    (i) => i.productId === item.productId && i.variantId === item.variantId
  );

  if (existingIndex > -1) {
    items[existingIndex].quantity += item.quantity;
  } else {
    items.push({ ...item });
  }

  memoryCarts.set(cartId, items);
  return { id: cartId, items: [...items] };
};

export const updateCartItemQuantity = async (
  cartId: string,
  productId: string,
  variantId: string | undefined,
  quantity: number
): Promise<Cart> => {
  const items = memoryCarts.get(cartId) || [];
  const item = items.find(
    (i) => i.productId === productId && i.variantId === variantId
  );

  if (item) {
    item.quantity = quantity;
  }

  memoryCarts.set(cartId, items);
  return { id: cartId, items: [...items] };
};

export const removeCartItem = (
  cartId: string,
  productId: string,
  variantId: string | undefined
): Cart => {
  let items = memoryCarts.get(cartId) || [];
  items = items.filter(
    (i) => !(i.productId === productId && i.variantId === variantId)
  );

  memoryCarts.set(cartId, items);
  return { id: cartId, items: [...items] };
};

export const mergeCarts = async (guestId: string, userId: string): Promise<Cart> => {
  const guestItems = memoryCarts.get(guestId) || [];
  const userItems = memoryCarts.get(userId) || [];

  for (const gItem of guestItems) {
    const existing = userItems.find(
      (u) => u.productId === gItem.productId && u.variantId === gItem.variantId
    );
    if (existing) {
      existing.quantity += gItem.quantity;
    } else {
      userItems.push({ ...gItem });
    }
  }

  memoryCarts.set(userId, userItems);
  memoryCarts.delete(guestId);

  return { id: userId, items: [...userItems] };
};

export interface QuoteInput {
  items: CartItem[];
  promos?: any[];
  taxPercent?: number;
  shippingAmount?: number;
}

export const quoteCart = (input: QuoteInput) => {
  const items = input.items || [];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  let discountTotal = 0;
  const appliedPromos: string[] = [];

  if (input.promos && input.promos.length > 0) {
    for (const promo of input.promos) {
      if (promo.isActive) {
        if (promo.discountType === 'percentage') {
          discountTotal += (subtotal * promo.discountValue) / 100;
        } else if (promo.discountType === 'fixed') {
          discountTotal += promo.discountValue;
        }
        appliedPromos.push(promo.code);
      }
    }
  }

  const taxableAmount = Math.max(0, subtotal - discountTotal);
  const taxPercent = input.taxPercent ?? 0;
  const taxAmount = (taxableAmount * taxPercent) / 100;
  const shippingAmount = input.shippingAmount ?? 0;
  const grandTotal = taxableAmount + taxAmount + shippingAmount;

  return {
    subtotal,
    discountTotal,
    taxableAmount,
    taxAmount,
    shippingAmount,
    grandTotal,
    appliedPromos,
  };
};

export const calculateShippingRates = async (destinationCity: string, weightKg: number) => {
  return {
    destinationCity,
    weightKg,
    services: [
      { service: 'Standard', cost: 10000 * weightKg, etd: '2-3 days' },
      { service: 'Express', cost: 20000 * weightKg, etd: '1 day' },
    ],
  };
};
