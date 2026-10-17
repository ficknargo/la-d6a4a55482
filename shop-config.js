/* ==========================================================================
   LOOSELY APPROVED — SHOP CONFIG  (the ONE place to edit for Shopify)
   --------------------------------------------------------------------------
   Checkout mode is chosen automatically:
     storefrontToken set  -> "live"      Storefront API Cart + Shopify hosted checkout
     else storeOpen:true  -> "permalink" cart permalink  https://STORE/cart/VARIANT:QTY,...
     else                 -> "demo"      simulated cart, checkout is a stub (current)
   Force one with forceMode: 'demo' | 'permalink' | 'live'.
   ========================================================================== */
window.LA_SHOP = {
  storeDomain: 'x4bdnu-ew.myshopify.com',

  // >>> PASTE THE STOREFRONT API *PUBLIC* ACCESS TOKEN HERE (safe to ship in client JS).
  //     Never paste an Admin API token (shpat_...) here.  Empty string = no token yet.
  storefrontToken: '',

  apiVersion: '2026-10',
  storeOpen: false,          // flip to true once the store is no longer password-protected
  forceMode: null,
  productHandle: 'x-ray-tee',

  // Hard-coded product data (matches the Shopify DRAFT product). In live mode price and
  // availability are refreshed from Shopify; these values are the fallback.
  title: 'X-Ray Tee',
  price: 45.00,              // placeholder price
  currency: 'USD',
  variants: [                // size label -> numeric Shopify variant ID (gid://shopify/ProductVariant/<id>)
    { size: 'S',   id: '67773529456855', available: true },
    { size: 'M',   id: '67773529489623', available: true },
    { size: 'L',   id: '67773529522391', available: true },
    { size: 'XL',  id: '67773529555159', available: true },
    { size: '2XL', id: '67773529587927', available: true }
  ],
  thumb: 'img/tee-back-1000.jpg'   // local image (Shopify has no product images yet)
};
