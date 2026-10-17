/* Loosely Approved — Drop 001 shop logic. Config lives in shop-config.js. No dependencies. */
(function () {
  'use strict';
  var C = window.LA_SHOP || {};
  var MODE = C.forceMode || (C.storefrontToken ? 'live' : (C.storeOpen ? 'permalink' : 'demo'));
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = function (n) {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: C.currency || 'USD' }).format(n); }
    catch (e) { return '$' + Number(n).toFixed(2); }
  };
  document.body.dataset.shopMode = MODE;

  var state = { size: null, qty: 1, lines: [], checkoutUrl: null, cartId: null, busy: false };
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  function variantBySize(s) { return C.variants.filter(function (v) { return v.size === s; })[0]; }
  function variantById(id) { return C.variants.filter(function (v) { return v.id === String(id); })[0]; }

  /* ---------- Storefront API (live mode) ---------- */
  var FRAG = 'id checkoutUrl totalQuantity lines(first:50){nodes{id quantity merchandise{... on ProductVariant{id title price{amount currencyCode}}}}}';
  function gql(query, vars) {
    var url = C.apiEndpoint || ('https://' + C.storeDomain + '/api/' + C.apiVersion + '/graphql.json');
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': C.storefrontToken },
      body: JSON.stringify({ query: query, variables: vars })
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (j.errors && j.errors.length) throw new Error(j.errors[0].message); return j.data; });
  }
  function applyRemoteCart(cart) {
    if (!cart) { state.lines = []; state.cartId = null; state.checkoutUrl = null; LS.del('la_cart_id'); return; }
    state.cartId = cart.id; state.checkoutUrl = cart.checkoutUrl; LS.set('la_cart_id', cart.id);
    state.lines = cart.lines.nodes.map(function (l) {
      var vid = String(l.merchandise.id).split('/').pop(), v = variantById(vid);
      return { key: l.id, vid: vid, size: v ? v.size : l.merchandise.title, qty: l.quantity, price: parseFloat(l.merchandise.price.amount) };
    });
  }
  function userErr(p) { if (p && p.userErrors && p.userErrors.length) throw new Error(p.userErrors[0].message); }

  var live = {
    init: function () {
      var id = LS.get('la_cart_id');
      var p = gql('query($h:String!){product(handle:$h){variants(first:20){nodes{id title availableForSale price{amount}}}}}', { h: C.productHandle })
        .then(function (d) {
          if (!d.product) return console.warn('[shop] product "' + C.productHandle + '" not visible to the Storefront API (is it ACTIVE and published to the channel?)');
          d.product.variants.nodes.forEach(function (n) {
            var v = variantById(String(n.id).split('/').pop());
            if (v) { v.available = n.availableForSale; C.price = parseFloat(n.price.amount); }
          });
          paintPrices(); paintAvailability();
        }).catch(function (e) { console.warn('[shop] product refresh failed', e); });
      var c = id ? gql('query($id:ID!){cart(id:$id){' + FRAG + '}}', { id: id }).then(function (d) { applyRemoteCart(d.cart); }).catch(function () { applyRemoteCart(null); }) : Promise.resolve();
      return Promise.all([p, c]);
    },
    add: function (size, qty) {
      var v = variantBySize(size), gid = 'gid://shopify/ProductVariant/' + v.id, lines = [{ merchandiseId: gid, quantity: qty }];
      var create = function () {
        return gql('mutation($i:CartInput!){cartCreate(input:$i){cart{' + FRAG + '} userErrors{message}}}', { i: { lines: lines } })
          .then(function (d) { userErr(d.cartCreate); applyRemoteCart(d.cartCreate.cart); });
      };
      if (!state.cartId) return create();
      return gql('mutation($c:ID!,$l:[CartLineInput!]!){cartLinesAdd(cartId:$c,lines:$l){cart{' + FRAG + '} userErrors{message}}}', { c: state.cartId, l: lines })
        .then(function (d) { userErr(d.cartLinesAdd); if (!d.cartLinesAdd.cart) return create(); applyRemoteCart(d.cartLinesAdd.cart); });
    },
    setQty: function (key, qty) {
      return gql('mutation($c:ID!,$l:[CartLineUpdateInput!]!){cartLinesUpdate(cartId:$c,lines:$l){cart{' + FRAG + '} userErrors{message}}}', { c: state.cartId, l: [{ id: key, quantity: qty }] })
        .then(function (d) { userErr(d.cartLinesUpdate); applyRemoteCart(d.cartLinesUpdate.cart); });
    },
    remove: function (key) {
      return gql('mutation($c:ID!,$l:[ID!]!){cartLinesRemove(cartId:$c,lineIds:$l){cart{' + FRAG + '} userErrors{message}}}', { c: state.cartId, l: [key] })
        .then(function (d) { userErr(d.cartLinesRemove); applyRemoteCart(d.cartLinesRemove.cart); });
    },
    checkout: function () { if (state.checkoutUrl) window.location.href = state.checkoutUrl; }
  };

  /* ---------- Local cart (demo + permalink modes) ---------- */
  function saveLocal() { LS.set('la_cart_v1', JSON.stringify(state.lines)); }
  var local = {
    init: function () {
      try { state.lines = JSON.parse(LS.get('la_cart_v1') || '[]').filter(function (l) { return variantBySize(l.size); }); } catch (e) { state.lines = []; }
      state.lines.forEach(function (l) { l.price = C.price; });
      return Promise.resolve();
    },
    add: function (size, qty) {
      var l = state.lines.filter(function (x) { return x.size === size; })[0];
      if (l) l.qty = Math.min(99, l.qty + qty); else state.lines.push({ key: size, vid: variantBySize(size).id, size: size, qty: qty, price: C.price });
      saveLocal(); return Promise.resolve();
    },
    setQty: function (key, qty) { state.lines.forEach(function (l) { if (l.key === key) l.qty = qty; }); saveLocal(); return Promise.resolve(); },
    remove: function (key) { state.lines = state.lines.filter(function (l) { return l.key !== key; }); saveLocal(); return Promise.resolve(); },
    checkout: function () {
      if (MODE === 'permalink') {
        window.location.href = 'https://' + C.storeDomain + '/cart/' + state.lines.map(function (l) { return l.vid + ':' + l.qty; }).join(',');
      } else {
        var n = count();
        toast('Preview only. Checkout opens here once this is approved.', 4200);
      }
    }
  };
  var api = MODE === 'live' ? live : local;

  /* ---------- Derived ---------- */
  function count() { return state.lines.reduce(function (a, l) { return a + l.qty; }, 0); }
  function subtotal() { return state.lines.reduce(function (a, l) { return a + l.qty * l.price; }, 0); }

  /* ---------- Toast ---------- */
  var toastEl = $('#toast'), toastT;
  function toast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2600);
  }

  /* ---------- Rendering ---------- */
  var drawer = $('#drawer'), overlay = $('#overlay'), linesEl = $('#cart-lines'), emptyEl = $('#cart-empty'), footEl = $('#cart-foot');
  function paintPrices() { $$('[data-price]').forEach(function (e) { e.textContent = money(C.price); }); }
  function paintAvailability() {
    C.variants.forEach(function (v) {
      $$('input[name=size][value="' + v.size + '"]').forEach(function (i) { i.disabled = !v.available; i.closest('.chip').classList.toggle('so', !v.available); });
      $$('.sb-sizes button[data-size="' + v.size + '"]').forEach(function (b) { b.disabled = !v.available; });
    });
  }
  function render() {
    var n = count();
    $$('.cc').forEach(function (e) { e.textContent = n; e.classList.toggle('has', n > 0); });
    linesEl.innerHTML = '';
    state.lines.forEach(function (l) {
      var li = document.createElement('li'); li.className = 'line';
      li.innerHTML = '<img src="' + C.thumb + '" alt="" width="72" height="90"><div class="li-t"><b>' + C.title + '</b><span>Black / ' + l.size + '</span>' +
        '<div class="step" role="group" aria-label="Quantity"><button data-dec aria-label="Decrease quantity">\u2212</button><output>' + l.qty + '</output><button data-inc aria-label="Increase quantity">+</button></div></div>' +
        '<div class="li-p">' + money(l.price * l.qty) + '<button class="rm" data-rm aria-label="Remove ' + C.title + ' ' + l.size + '">Remove</button></div>';
      li.dataset.key = l.key; li.dataset.qty = l.qty; linesEl.appendChild(li);
    });
    emptyEl.hidden = n > 0; footEl.hidden = n === 0;
    $('#cart-sub').textContent = money(subtotal());
  }
  function busy(b) {
    state.busy = b;
    $$('.atc, .sb-add').forEach(function (x) { x.disabled = b; x.classList.toggle('busy', b); });
  }

  /* ---------- Drawer ---------- */
  var lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement; drawer.classList.add('open'); overlay.classList.add('open');
    document.documentElement.classList.add('lock'); drawer.setAttribute('aria-hidden', 'false'); overlay.hidden = false;
    setTimeout(function () { $('#cart-close').focus(); }, 60);
  }
  function closeCart() {
    drawer.classList.remove('open'); overlay.classList.remove('open'); document.documentElement.classList.remove('lock');
    drawer.setAttribute('aria-hidden', 'true'); setTimeout(function () { if (!overlay.classList.contains('open')) overlay.hidden = true; }, 350);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $$('[data-cart-open]').forEach(function (b) { b.addEventListener('click', openCart); });
  $$('[data-cart-close]').forEach(function (b) { b.addEventListener('click', closeCart); });
  document.addEventListener('keydown', function (e) {
    if (!drawer.classList.contains('open')) return;
    if (e.key === 'Escape') return closeCart();
    if (e.key === 'Tab') {
      var f = $$('button,a[href],input,[tabindex]:not([tabindex="-1"])', drawer).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  linesEl.addEventListener('click', function (e) {
    var li = e.target.closest('.line'); if (!li) return;
    var key = li.dataset.key, q = parseInt(li.dataset.qty, 10), p;
    if (e.target.closest('[data-inc]')) p = api.setQty(key, Math.min(99, q + 1));
    else if (e.target.closest('[data-dec]')) p = q <= 1 ? api.remove(key) : api.setQty(key, q - 1);
    else if (e.target.closest('[data-rm]')) p = api.remove(key);
    if (p) p.then(render).catch(function () { toast('Didn\u2019t go through. Try again.'); });
  });
  $('#checkout').addEventListener('click', function () { api.checkout(); });
  $('#demo-banner').hidden = MODE !== 'demo';

  /* ---------- Size + add to cart ---------- */
  function selectSize(s) {
    state.size = s;
    $$('input[name=size]').forEach(function (i) { i.checked = i.value === s; });
    $$('.sb-sizes button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.size === s); b.classList.toggle('on', b.dataset.size === s); });
    $('#size-note').textContent = s ? 'Black / ' + s + '. Good call. Probably.' : '';
    $$('.sizes, .sb-sizes').forEach(function (e) { e.classList.remove('need'); });
  }
  function needSize() {
    $('#size-note').textContent = 'Pick a size first. Even loosely approved things have a fit.';
    $$('.sizes, .sb-sizes').forEach(function (e) { e.classList.remove('need'); void e.offsetWidth; e.classList.add('need'); });
    toast('Pick a size first.');
  }
  $$('input[name=size]').forEach(function (i) { i.addEventListener('change', function () { selectSize(i.value); }); });
  $$('.sb-sizes button').forEach(function (b) { b.addEventListener('click', function () { selectSize(b.dataset.size); }); });
  $('#qty-dec').addEventListener('click', function () { state.qty = Math.max(1, state.qty - 1); $('#qty').textContent = state.qty; });
  $('#qty-inc').addEventListener('click', function () { state.qty = Math.min(9, state.qty + 1); $('#qty').textContent = state.qty; });
  function add() {
    if (state.busy) return;
    if (!state.size) return needSize();
    busy(true);
    api.add(state.size, state.qty).then(function () { render(); busy(false); openCart(); })
      .catch(function (e) { console.warn('[shop]', e); busy(false); toast('Didn\u2019t go through. Try again.'); });
  }
  $$('.atc, .sb-add').forEach(function (b) { b.addEventListener('click', add); });

  /* ---------- Gallery (scroll-snap) ---------- */
  var stage = $('#stage'), slides = $$('.slide', stage), thumbs = $$('.strip button'), cur = $('#view-cur');
  function goto(i) { i = (i + slides.length) % slides.length; stage.scrollTo({ left: i * stage.clientWidth, behavior: 'smooth' }); }
  function sync() {
    var i = Math.round(stage.scrollLeft / Math.max(1, stage.clientWidth));
    cur.textContent = '0' + (i + 1);
    thumbs.forEach(function (t, k) { t.classList.toggle('on', k === i); t.setAttribute('aria-current', k === i); });
  }
  stage.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
  thumbs.forEach(function (t, k) { t.addEventListener('click', function () { goto(k); }); });
  $('#g-prev').addEventListener('click', function () { goto(Math.round(stage.scrollLeft / stage.clientWidth) - 1); });
  $('#g-next').addEventListener('click', function () { goto(Math.round(stage.scrollLeft / stage.clientWidth) + 1); });
  stage.addEventListener('keydown', function (e) {
    var i = Math.round(stage.scrollLeft / stage.clientWidth);
    if (e.key === 'ArrowRight') { e.preventDefault(); goto(i + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); goto(i - 1); }
  });
  sync();

  /* ---------- Sticky add-to-cart + reveal ---------- */
  if ('IntersectionObserver' in window) {
    var sbar = $('#sbar'), vis = { hero: true, atc: false, drop: false }, upd = function () {
      var on = vis.drop && !vis.hero && !vis.atc && !drawer.classList.contains('open');
      sbar.classList.toggle('on', on); sbar.setAttribute('aria-hidden', !on);
    };
    var watch = function (sel, key) { var el = $(sel); if (!el) return; new IntersectionObserver(function (en) { vis[key] = en[0].isIntersecting; upd(); }).observe(el); };
    watch('.drop-hero', 'hero'); watch('.panel .atc', 'atc'); watch('#drop', 'drop');
    new MutationObserver(upd).observe(drawer, { attributes: true, attributeFilter: ['class'] });
    var rio = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); rio.unobserve(x.target); } }); }, { threshold: .12 });
    $$('.rv').forEach(function (e) { rio.observe(e); });
  } else { $$('.rv').forEach(function (e) { e.classList.add('in'); }); }

  /* ---------- Boot ---------- */
  paintPrices(); paintAvailability(); render();
  api.init().then(function () { paintPrices(); paintAvailability(); render(); }).catch(function (e) { console.warn('[shop] init', e); });
  window.LA_SHOP_MODE = MODE;
})();
