import {
  api,
  icon,
  money,
  escapeHtml,
  imageTag,
  toast,
  openModal,
  confirmDialog,
  ORDER_STATUS,
  payMethodLabel,
  formatDateTime,
  stars,
} from './ui.js?v=20261113';

/* ------------------------------------------------------------------ */
/* 状态与工具                                                          */
/* ------------------------------------------------------------------ */

const state = { user: null, cart: null, categories: [] };

const view = document.getElementById('view');
const actionsEl = document.getElementById('header-actions');

// 首屏使用整机实拍图（本地缓存），不再使用 AI 生成图
const HERO_IMAGE = '/images/products/2.jpg';

const priceHtml = (cents, cls = 'price') => {
  const text = money(cents);
  return `<span class="${cls}"><small>¥</small>${text.slice(1)}</span>`;
};

function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', params: new URLSearchParams(query) };
}

function currentHashWith(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const text = search.toString();
  return `#/products${text ? `?${text}` : ''}`;
}

function requireLogin() {
  if (state.user) return true;
  sessionStorage.setItem('nova_redirect', location.hash || '#/');
  toast('请先登录后再继续', 'error');
  location.hash = '#/login';
  return false;
}

function emptyState({ iconName = 'inbox', title, text, actionText, actionHref }) {
  return `<div class="empty">
    <div class="eicon">${icon(iconName, 28)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(text)}</p>
    ${actionText ? `<a class="btn btn-primary" href="${actionHref}">${escapeHtml(actionText)}</a>` : ''}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* 头部                                                                */
/* ------------------------------------------------------------------ */

function renderHeader() {
  const count = state.cart ? state.cart.summary.count : 0;
  const cartBadge = count ? `<span class="cart-badge">${count > 99 ? '99+' : count}</span>` : '';

  if (!state.user) {
    actionsEl.innerHTML = `
      <a class="icon-btn" href="#/login">${icon('user', 17)}<span>登录</span></a>
      <a class="icon-btn" href="#/cart">${icon('cart', 17)}<span>购物车</span>${cartBadge}</a>
    `;
  } else {
    const name = state.user.username;
    actionsEl.innerHTML = `
      <a class="icon-btn" href="#/cart" aria-label="购物车">${icon('cart', 17)}<span>购物车</span>${cartBadge}</a>
      <div class="user-chip" id="user-chip">
        <span class="avatar">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>
        <span class="uname">${escapeHtml(name)}</span>
        ${icon('chevronDown', 14)}
        <div class="user-menu" id="user-menu">
          <a href="#/orders">${icon('package', 16)} 我的订单</a>
          <a href="#/cart">${icon('cart', 16)} 购物车</a>
          ${state.user.role === 'admin' ? `<a href="/admin">${icon('grid', 16)} 管理后台</a>` : ''}
          <div class="divider"></div>
          <button type="button" id="logout-btn">${icon('logout', 16)} 退出登录</button>
        </div>
      </div>
    `;
    const chip = document.getElementById('user-chip');
    const menu = document.getElementById('user-menu');
    chip.addEventListener('click', (event) => {
      if (event.target.closest('#user-menu')) return;
      event.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'), { once: true });
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      state.cart = null;
      renderHeader();
      toast('已退出登录');
      location.hash = '#/';
    });
  }

  document.querySelectorAll('[data-nav]').forEach((link) => {
    const nav = link.dataset.nav;
    const { path } = parseHash();
    const active =
      (nav === 'home' && path === '/') ||
      (nav === 'products' && path === '/products' && !parseHash().params.get('sort')) ||
      (nav === 'hot' && path === '/products' && parseHash().params.get('sort') === 'sales') ||
      (nav === 'orders' && path.startsWith('/orders'));
    link.classList.toggle('active', active);
  });
}

async function refreshCart() {
  if (!state.user) {
    state.cart = null;
    renderHeader();
    return;
  }
  try {
    state.cart = await api('/api/cart');
  } catch {
    state.cart = null;
  }
  renderHeader();
}

/* ------------------------------------------------------------------ */
/* 组件片段                                                            */
/* ------------------------------------------------------------------ */

function productCard(product) {
  return `
    <article class="product-card">
      <div class="thumb">
        <a href="#/product/${product.id}" style="display:block;height:100%" aria-label="${escapeHtml(product.name)}">
          ${imageTag(product.image, product.name)}
        </a>
        ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ''}
        <button class="quick-add" type="button" data-add="${product.id}" aria-label="加入购物车" ${product.stock <= 0 ? 'disabled' : ''}>
          ${icon('plus', 17)}
        </button>
      </div>
      <div class="info">
        <span class="cat">${escapeHtml(product.categoryName || 'NOVA PC')}</span>
        <a href="#/product/${product.id}"><h3>${escapeHtml(product.name)}</h3></a>
        <span class="desc">${escapeHtml(product.subtitle)}</span>
        <div class="price-row">
          ${priceHtml(product.price)}
          ${product.originalPrice > product.price ? `<span class="price-old">${money(product.originalPrice)}</span>` : ''}
          <span class="rating">${icon('star', 12)}${product.rating}</span>
        </div>
      </div>
    </article>
  `;
}

function skeletonGrid(count = 8) {
  return `<div class="product-grid">${Array.from(
    { length: count },
    () =>
      `<div class="product-card"><div class="thumb skeleton"></div><div class="info"><div class="skeleton" style="height:12px;width:40%;border-radius:4px"></div><div class="skeleton" style="height:16px;width:80%;border-radius:4px"></div><div class="skeleton" style="height:20px;width:50%;border-radius:4px"></div></div></div>`
  ).join('')}</div>`;
}

function paginationHtml(page, pages) {
  if (pages <= 1) return '';
  const total = pages;
  let start = Math.max(1, page - 2);
  const end = Math.min(total, start + 4);
  start = Math.max(1, end - 4);
  const numbers = [];
  for (let index = start; index <= end; index += 1) numbers.push(index);
  return `<div class="pagination">
    <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 15)}</button>
    ${numbers.map((n) => `<button type="button" data-page="${n}" class="${n === page ? 'active' : ''}">${n}</button>`).join('')}
    <button type="button" data-page="${page + 1}" ${page >= total ? 'disabled' : ''}>${icon('chevronRight', 15)}</button>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* 首页                                                                */
/* ------------------------------------------------------------------ */

async function renderHome() {
  view.innerHTML = `<div class="container"><div class="hero"><div class="hero-inner"><div class="hero-copy"></div></div></div>${skeletonGrid()}</div>`;
  const data = await api('/api/home');
  const featured = data.featured.length ? data.featured : data.hot.slice(0, 8);
  const homeCategory = data.categories.find((item) => item.name === '整机方案') || data.categories[0];
  const digitalCategory = data.categories.find((item) => item.name === '散热系统') || data.categories[1];

  view.innerHTML = `
    <section class="hero">
      <div class="container hero-inner">
        <div class="hero-copy">
          <span class="eyebrow">NOVA PC · 2026 装机严选</span>
          <h1>把性能，<br>装进<em>你的机箱</em>。</h1>
          <p class="hero-lead">从旗舰整机到每一颗配件，200 款热门型号现货直发。正品保障、三年质保，DIY 装机也能一次点亮。</p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/products">立即选购 ${icon('arrowRight', 17)}</a>
            <a class="btn btn-ghost btn-lg" href="#/products?sort=sales">查看热卖榜</a>
          </div>
          <div class="hero-stats">
            <div><strong>200</strong><span>款在售硬件</span></div>
            <div><strong>4.8</strong><span>平均用户评分</span></div>
            <div><strong>48h</strong><span>极速发货</span></div>
          </div>
        </div>
        <div class="hero-media">
          <div class="hero-frame">
            ${imageTag(HERO_IMAGE, 'NOVA PC 装机严选')}
            <span class="hero-tag">BUILD OF THE WEEK</span>
          </div>
          <div class="hero-float">
            <span class="dot">${icon('sparkles', 19)}</span>
            <div>
              <strong>本周热卖 1,286 件</strong>
              <span>华硕 TUF RTX 5080 OC 16G</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <h2>按分类逛逛</h2>
            <p class="sub">九大硬件分类，从整机到每一颗风扇</p>
          </div>
          <a class="more" href="#/products">全部商品 ${icon('arrowRight', 15)}</a>
        </div>
        <div class="cat-grid">
          ${data.categories
            .map(
              (category) => `
              <a class="cat-card" href="${currentHashWith({ categoryId: category.id })}">
                <span class="cat-icon">${icon(category.icon, 22)}</span>
                <strong>${escapeHtml(category.name)}</strong>
                <span>${category.productCount} 件单品</span>
              </a>`
            )
            .join('')}
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:8px">
      <div class="container">
        <div class="section-head">
          <div>
            <h2>本周精选</h2>
            <p class="sub">编辑团队实测后，仍然愿意推荐给朋友的型号</p>
          </div>
          <a class="more" href="#/products?sort=rating">按评分浏览 ${icon('arrowRight', 15)}</a>
        </div>
        <div class="product-grid">${featured.map(productCard).join('')}</div>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="container promo-grid">
        <div class="promo-card">
          <span class="eyebrow">GAMING BUILDS</span>
          <h3>一台好主机，<br>是慢慢配出来的。</h3>
          <p>从显卡、主板到水冷与机箱，按预算自由组合，兼容性我们来把关，整机三年质保。</p>
          <a class="btn btn-primary btn-sm" href="${currentHashWith({ categoryId: homeCategory ? homeCategory.id : '' })}">查看整机方案</a>
          <span class="deco"></span>
        </div>
        <div class="promo-card alt">
          <span class="eyebrow" style="color:rgba(232,185,141,.8)">COOLING &amp; CASE</span>
          <h3>压得住温度，<br>才放得开性能。</h3>
          <p>360 水冷、双塔风冷与海景房机箱，给高功耗平台留足余量，灯效也要好看。</p>
          <a class="btn btn-accent btn-sm" href="${currentHashWith({ categoryId: digitalCategory ? digitalCategory.id : '' })}">去挑散热机箱</a>
          <span class="deco"></span>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="container">
        <div class="section-head">
          <div>
            <h2>热卖榜单</h2>
            <p class="sub">过去 30 天里，被最多人带回家的单品</p>
          </div>
          <a class="more" href="#/products?sort=sales">完整榜单 ${icon('arrowRight', 15)}</a>
        </div>
        <div class="product-grid">${data.hot.map(productCard).join('')}</div>
      </div>
    </section>

    <section class="feature-band">
      <div class="container feature-grid">
        <div class="feature-item"><span class="ficon">${icon('truck', 20)}</span><div><strong>48 小时极速发货</strong><span>每日 15:00 前下单当天出库</span></div></div>
        <div class="feature-item"><span class="ficon">${icon('shield', 20)}</span><div><strong>正品保障</strong><span>官方授权渠道，假一赔十</span></div></div>
        <div class="feature-item"><span class="ficon">${icon('refresh', 20)}</span><div><strong>7 天无理由退换</strong><span>不满意可随时申请售后</span></div></div>
        <div class="feature-item"><span class="ficon">${icon('wallet', 20)}</span><div><strong>顺丰包邮</strong><span>全国大部分地区免费配送</span></div></div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <h2>新品上架</h2>
            <p class="sub">刚刚抵达仓库的新鲜面孔</p>
          </div>
          <a class="more" href="#/products?sort=new">查看更多 ${icon('arrowRight', 15)}</a>
        </div>
        <div class="product-grid">${data.newest.map(productCard).join('')}</div>
      </div>
    </section>
  `;
}

/* ------------------------------------------------------------------ */
/* 商品列表                                                            */
/* ------------------------------------------------------------------ */

async function renderProducts(params) {
  const keyword = params.get('keyword') || '';
  const categoryId = params.get('categoryId') || '';
  const sort = params.get('sort') || 'recommend';
  const page = Number(params.get('page') || 1);

  if (!state.categories.length) {
    state.categories = await api('/api/categories');
  }

  view.innerHTML = `<div class="container"><div class="list-head"><div><h1>正在加载…</h1></div></div>${skeletonGrid(8)}</div>`;

  const query = new URLSearchParams({ page: String(page), pageSize: '12', sort });
  if (keyword) query.set('keyword', keyword);
  if (categoryId) query.set('categoryId', categoryId);
  const result = await api(`/api/products?${query.toString()}`);

  const activeCategory = state.categories.find((item) => String(item.id) === String(categoryId));
  const title = keyword ? `“${keyword}” 的搜索结果` : activeCategory ? activeCategory.name : '全部商品';
  const subtitle = keyword
    ? `共找到 ${result.total} 件相关商品`
    : activeCategory
      ? `${activeCategory.description || '精选硬件'} · 共 ${result.total} 件`
      : `NOVA PC · 共 ${result.total} 件硬件在售`;

  const sortOptions = [
    ['recommend', '综合推荐'],
    ['sales', '销量优先'],
    ['price_asc', '价格从低到高'],
    ['price_desc', '价格从高到低'],
    ['rating', '评分最高'],
    ['new', '最新上架'],
  ];

  view.innerHTML = `
    <div class="container">
      <div class="breadcrumb">
        <a href="#/">首页</a><span class="sep">/</span><span>${escapeHtml(title)}</span>
      </div>
      <div class="list-head">
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <span class="result-meta">第 ${result.page} / ${result.pages} 页</span>
      </div>

      <div class="toolbar">
        <div class="chip-row">
          <button class="chip ${!categoryId ? 'active' : ''}" data-category="">全部</button>
          ${state.categories
            .map(
              (category) =>
                `<button class="chip ${String(category.id) === String(categoryId) ? 'active' : ''}" data-category="${category.id}">${escapeHtml(category.name)}</button>`
            )
            .join('')}
        </div>
        <div class="sort-tabs">
          ${sortOptions
            .map(
              ([value, label]) =>
                `<button type="button" data-sort="${value}" class="${sort === value ? 'active' : ''}">${label}</button>`
            )
            .join('')}
        </div>
      </div>

      ${
        result.items.length
          ? `<div class="product-grid">${result.items.map(productCard).join('')}</div>`
          : emptyState({
              iconName: 'search',
              title: '没有找到相关商品',
              text: '换个关键词或分类再试试，也可以看看我们的热卖榜单。',
              actionText: '查看热卖榜',
              actionHref: '#/products?sort=sales',
            })
      }

      ${paginationHtml(result.page, result.pages)}
    </div>
  `;

  view.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      const base = { keyword, sort: sort === 'recommend' ? '' : sort };
      location.hash = currentHashWith({ ...base, categoryId: button.dataset.category });
    });
  });
  view.querySelectorAll('[data-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = currentHashWith({ keyword, categoryId, sort: button.dataset.sort });
    });
  });
  view.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = currentHashWith({ keyword, categoryId, sort: sort === 'recommend' ? '' : sort, page: button.dataset.page });
    });
  });
}

/* ------------------------------------------------------------------ */
/* 商品详情                                                            */
/* ------------------------------------------------------------------ */

async function renderProduct(id) {
  const data = await api(`/api/products/${id}`);
  const product = data.product;
  let quantity = 1;
  const maxQuantity = Math.max(1, Math.min(product.stock, 99));

  view.innerHTML = `
    <div class="container">
      <div class="breadcrumb">
        <a href="#/">首页</a><span class="sep">/</span>
        <a href="${currentHashWith({ categoryId: product.categoryId })}">${escapeHtml(product.categoryName || '全部商品')}</a>
        <span class="sep">/</span><span>${escapeHtml(product.name)}</span>
      </div>

      <div class="detail-grid">
        <div class="gallery">
          <div class="gallery-main">
            ${imageTag(product.image, product.name, 'id="main-image"')}
          </div>
          <div class="gallery-thumbs">
            ${[
              ['50% 50%', 1],
              ['25% 40%', 1.45],
              ['75% 60%', 1.45],
            ]
              .map(
                ([position, scale], index) => `
                <button type="button" data-pos="${position}" data-scale="${scale}" class="${index === 0 ? 'active' : ''}">
                  <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} 细节 ${index + 1}"
                       style="object-position:${position};transform:scale(${scale})" onerror="this.style.display='none'">
                </button>`
              )
              .join('')}
          </div>
        </div>

        <div class="detail-info">
          <div class="cat-line">
            <span>${escapeHtml(product.categoryName || 'NOVA PC')}</span>
            ${product.badge ? `<span class="pill" style="background:var(--accent-soft);color:var(--accent-dark);padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:700">${escapeHtml(product.badge)}</span>` : ''}
          </div>
          <h1>${escapeHtml(product.name)}</h1>
          <p class="detail-sub">${escapeHtml(product.subtitle)}</p>
          <div class="detail-rating">
            ${stars(product.rating, 14)}
            <b>${product.rating}</b>
            <span>${product.reviews} 条评价</span>
            <span class="pill">${product.sales} 人已购买</span>
          </div>

          <div class="price-panel">
            ${priceHtml(product.price, 'now')}
            ${product.originalPrice > product.price ? `<span class="was">${money(product.originalPrice)}</span>` : ''}
            ${
              product.originalPrice > product.price
                ? `<span class="save">立省 ${money(product.originalPrice - product.price)}</span>`
                : ''
            }
          </div>

          <div class="meta-line">
            <span>商品编号 <b>NV-${String(product.id).padStart(4, '0')}</b></span>
            <span>库存 <b>${product.stock}</b> 件</span>
            <span>累计销量 <b>${product.sales}</b></span>
          </div>

          <div class="buy-row">
            <div class="stepper" id="detail-stepper">
              <button type="button" data-step="-1" ${product.stock <= 0 ? 'disabled' : ''}>${icon('minus', 15)}</button>
              <input type="number" value="1" min="1" max="${maxQuantity}" inputmode="numeric" aria-label="购买数量">
              <button type="button" data-step="1" ${product.stock <= 0 ? 'disabled' : ''}>${icon('plus', 15)}</button>
            </div>
            <button class="btn btn-primary" id="add-to-cart" ${product.stock <= 0 ? 'disabled' : ''}>
              ${icon('cart', 17)} ${product.stock <= 0 ? '暂时缺货' : '加入购物车'}
            </button>
            <button class="btn btn-accent" id="buy-now" ${product.stock <= 0 ? 'disabled' : ''}>立即购买</button>
          </div>
          <p class="stock-hint ${product.stock <= 20 ? 'low' : ''}">
            ${product.stock <= 0 ? '该商品暂时缺货，可先加入收藏等待补货' : product.stock <= 20 ? `库存紧张，仅剩 ${product.stock} 件` : '现货充足，15:00 前下单当天发货'}
          </p>

          <ul class="service-list">
            <li>${icon('checkCircle', 15)} 正品保障，官方授权</li>
            <li>${icon('truck', 15)} 顺丰包邮，48h 内发货</li>
            <li>${icon('refresh', 15)} 7 天无理由退换</li>
            <li>${icon('shield', 15)} 三年质保，支持个人送保</li>
          </ul>
        </div>
      </div>

      <div class="detail-body">
        <div>
          <h2>商品详情</h2>
          <p>${escapeHtml(product.description)}</p>
          <p style="margin-top:14px">每一颗配件都要经得起长期高负载：从用料、焊点到风扇轴承，NOVA 团队会在发货前逐一检测并加固包装。若收到商品有任何问题，可在订单页一键申请售后，装机遇到兼容性问题也可以直接咨询客服。</p>
          <div class="promo-grid" style="margin-top:28px">
            <div class="promo-card" style="min-height:120px;padding:24px">
              <strong style="font-size:15px">${icon('truck', 16)} 配送说明</strong>
              <p style="font-size:12px;max-width:none">每日 15:00 前支付的订单当天出库，偏远地区可能延迟 1-2 天。</p>
            </div>
            <div class="promo-card" style="min-height:120px;padding:24px">
              <strong style="font-size:15px">${icon('refresh', 16)} 售后政策</strong>
              <p style="font-size:12px;max-width:none">签收后 7 天内可无理由退换，商品需保持完好并保留包装。</p>
            </div>
          </div>
        </div>
        <aside class="spec-card">
          <h3>规格参数</h3>
          <ul class="spec-list">
            <li><span>品牌</span><b>NOVA PC</b></li>
            <li><span>所属分类</span><b>${escapeHtml(product.categoryName || '—')}</b></li>
            <li><span>商品编号</span><b>NV-${String(product.id).padStart(4, '0')}</b></li>
            <li><span>当前库存</span><b>${product.stock} 件</b></li>
            <li><span>发货时效</span><b>48 小时内</b></li>
            <li><span>售后服务</span><b>7 天无理由</b></li>
          </ul>
        </aside>
      </div>

      ${
        data.related.length
          ? `<section class="related">
              <div class="section-head"><h2>看了又看</h2><a class="more" href="${currentHashWith({ categoryId: product.categoryId })}">同分类硬件 ${icon('arrowRight', 15)}</a></div>
              <div class="product-grid">${data.related.map(productCard).join('')}</div>
            </section>`
          : ''
      }
    </div>
  `;

  const stepper = document.getElementById('detail-stepper');
  const input = stepper.querySelector('input');
  stepper.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      quantity = Math.min(maxQuantity, Math.max(1, quantity + Number(button.dataset.step)));
      input.value = String(quantity);
      stepper.querySelector('[data-step="-1"]').disabled = quantity <= 1;
      stepper.querySelector('[data-step="1"]').disabled = quantity >= maxQuantity;
    });
  });
  input.addEventListener('change', () => {
    quantity = Math.min(maxQuantity, Math.max(1, Number(input.value) || 1));
    input.value = String(quantity);
  });
  stepper.querySelector('[data-step="-1"]').disabled = true;

  const thumbs = view.querySelectorAll('.gallery-thumbs button');
  thumbs.forEach((button) => {
    button.addEventListener('click', () => {
      thumbs.forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      const main = document.getElementById('main-image');
      main.style.objectPosition = button.dataset.pos;
      main.style.transform = `scale(${button.dataset.scale})`;
    });
  });

  document.getElementById('add-to-cart').addEventListener('click', async (event) => {
    if (!requireLogin()) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await addToCart(product.id, quantity);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('buy-now').addEventListener('click', async () => {
    if (!requireLogin()) return;
    const ok = await addToCart(product.id, quantity);
    if (ok) location.hash = '#/checkout';
  });
}

/* ------------------------------------------------------------------ */
/* 购物车                                                              */
/* ------------------------------------------------------------------ */

async function addToCart(productId, quantity = 1) {
  try {
    const cart = await api('/api/cart/items', { method: 'POST', body: { productId, quantity } });
    state.cart = cart;
    renderHeader();
    toast('已加入购物车');
    return true;
  } catch (error) {
    toast(error.message, 'error');
    return false;
  }
}

async function renderCart() {
  const cart = await api('/api/cart');
  state.cart = cart;
  renderHeader();
  paintCart(cart);
}

function paintCart(cart) {
  const items = cart.items;
  if (!items.length) {
    view.innerHTML = `
      <div class="container">
        <div class="page-head"><h1>购物车</h1><p>购物车里空空如也，去挑几件喜欢的吧</p></div>
        <div style="padding:26px 0 20px">
          ${emptyState({
            iconName: 'cart',
            title: '购物车还是空的',
            text: '从本周精选开始逛逛，全场包邮，7 天无理由退换。',
            actionText: '去逛逛',
            actionHref: '#/products',
          })}
        </div>
      </div>`;
    return;
  }

  const availableItems = items.filter((item) => item.available);
  const allSelected = availableItems.length > 0 && availableItems.every((item) => item.selected);
  const selectedCount = cart.summary.selectedCount;

  view.innerHTML = `
    <div class="container">
      <div class="page-head">
        <h1>购物车</h1>
        <p>共 ${cart.summary.count} 件商品，已选 ${selectedCount} 件</p>
      </div>
      <div class="cart-layout">
        <div>
          <div class="cart-list">
            <div class="cart-list-head">
              <input type="checkbox" class="checkbox" id="select-all" ${allSelected ? 'checked' : ''} aria-label="全选">
              <div class="cart-head-grid">
                <span>商品信息</span><span>单价</span><span>数量</span><span>小计</span><span></span>
              </div>
            </div>
            ${items
              .map(
                (item) => `
                <div class="cart-item ${item.available ? '' : 'unavailable'}" data-item="${item.id}">
                  <input type="checkbox" class="checkbox" data-check="${item.id}" ${item.selected && item.available ? 'checked' : ''} ${item.available ? '' : 'disabled'} aria-label="选择 ${escapeHtml(item.name)}">
                  <div class="cart-item-main">
                    <a class="cart-thumb" href="#/product/${item.productId}">${imageTag(item.image, item.name)}</a>
                    <div>
                      <a class="cart-title" href="#/product/${item.productId}">${escapeHtml(item.name)}</a>
                      <div class="cart-sub">${escapeHtml(item.subtitle)}</div>
                      ${
                        !item.available
                          ? '<div class="cart-sub" style="color:var(--accent)">商品已下架或缺货</div>'
                          : item.stock <= 20
                            ? `<div class="cart-sub" style="color:var(--accent)">仅剩 ${item.stock} 件</div>`
                            : ''
                      }
                    </div>
                    <div class="cart-price">${money(item.price)}</div>
                    <div>
                      <div class="stepper">
                        <button type="button" data-qty="${item.id}" data-delta="-1" ${item.quantity <= 1 ? 'disabled' : ''}>${icon('minus', 13)}</button>
                        <input type="number" value="${item.quantity}" min="1" max="${Math.min(item.stock, 99)}" readonly aria-label="数量">
                        <button type="button" data-qty="${item.id}" data-delta="1" ${item.quantity >= Math.min(item.stock, 99) ? 'disabled' : ''}>${icon('plus', 13)}</button>
                      </div>
                    </div>
                    <div class="cart-subtotal">${money(item.price * item.quantity)}</div>
                    <button type="button" class="cart-remove" data-remove="${item.id}" aria-label="删除">${icon('trash', 15)}</button>
                  </div>
                </div>`
              )
              .join('')}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:14px">
            <a class="btn btn-link" href="#/products">${icon('chevronLeft', 15)} 继续购物</a>
            <span class="result-meta">全场包邮 · 48 小时内发货</span>
          </div>
        </div>

        <aside class="summary-card">
          <h2>订单摘要</h2>
          <div class="summary-row"><span>已选商品</span><b>${selectedCount} 件</b></div>
          <div class="summary-row"><span>商品金额</span><b>${money(cart.summary.subtotal)}</b></div>
          <div class="summary-row"><span>运费</span><b>免运费</b></div>
          <div class="summary-row"><span>优惠</span><b style="color:var(--green)">已享会员价</b></div>
          <div class="summary-total">
            <span>合计</span>
            <strong><small>¥</small>${money(cart.summary.subtotal).slice(1)}</strong>
          </div>
          <a class="btn btn-primary btn-block" href="#/checkout" aria-disabled="${selectedCount === 0}" style="${selectedCount === 0 ? 'pointer-events:none;opacity:.45' : ''}">
            去结算 ${icon('arrowRight', 16)}
          </a>
          <p class="summary-note">提交订单后可选择支付宝 / 微信 / 银行卡进行模拟支付<br>支付成功后管理员将尽快为你发货</p>
        </aside>
      </div>
    </div>
  `;

  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', async () => {
      try {
        const results = await Promise.all(
          availableItems.map((item) =>
            api(`/api/cart/items/${item.id}`, { method: 'PATCH', body: { selected: selectAll.checked } })
          )
        );
        if (results.length) {
          state.cart = results[results.length - 1];
          renderHeader();
          paintCart(state.cart);
        }
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  view.querySelectorAll('[data-check]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      try {
        const cartData = await api(`/api/cart/items/${checkbox.dataset.check}`, {
          method: 'PATCH',
          body: { selected: checkbox.checked },
        });
        state.cart = cartData;
        renderHeader();
        paintCart(cartData);
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });

  view.querySelectorAll('[data-qty]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('.cart-item');
      const input = row.querySelector('input[readonly]');
      const next = Number(input.value) + Number(button.dataset.delta);
      try {
        const cartData = await api(`/api/cart/items/${button.dataset.qty}`, {
          method: 'PATCH',
          body: { quantity: next },
        });
        state.cart = cartData;
        renderHeader();
        paintCart(cartData);
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });

  view.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const cartData = await api(`/api/cart/items/${button.dataset.remove}`, { method: 'DELETE' });
        state.cart = cartData;
        renderHeader();
        paintCart(cartData);
        toast('已从购物车移除');
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* 结算                                                                */
/* ------------------------------------------------------------------ */

async function renderCheckout() {
  const cart = await api('/api/cart');
  state.cart = cart;
  renderHeader();

  const selected = cart.items.filter((item) => item.selected && item.available);
  if (!selected.length) {
    view.innerHTML = `<div class="container"><div class="page-head"><h1>确认订单</h1></div><div style="padding:26px 0">${emptyState(
      { iconName: 'cart', title: '没有待结算的商品', text: '请先在购物车中勾选要购买的商品。', actionText: '返回购物车', actionHref: '#/cart' }
    )}</div></div>`;
    return;
  }

  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('nova_address') || '{}');
  } catch {
    saved = {};
  }

  const total = cart.summary.subtotal;

  view.innerHTML = `
    <div class="container">
      <div class="breadcrumb"><a href="#/cart">购物车</a><span class="sep">/</span><span>确认订单</span></div>
      <div class="page-head"><h1>确认订单</h1><p>请核对收货信息与商品清单，提交后即可模拟支付</p></div>

      <div class="checkout-layout">
        <div>
          <section class="panel">
            <div class="panel-head"><span class="step-no">1</span><h2>收货信息</h2></div>
            <div class="form-grid">
              <div class="field">
                <label for="receiverName">收货人 <em>*</em></label>
                <input class="input" id="receiverName" name="receiverName" placeholder="请输入姓名" value="${escapeHtml(saved.receiverName || '')}" maxlength="30">
              </div>
              <div class="field">
                <label for="phone">手机号码 <em>*</em></label>
                <input class="input" id="phone" name="phone" placeholder="11 位手机号" value="${escapeHtml(saved.phone || '')}" maxlength="11" inputmode="numeric">
              </div>
              <div class="field full">
                <label for="address">详细地址 <em>*</em></label>
                <textarea class="textarea" id="address" name="address" placeholder="省 / 市 / 区 / 街道 / 门牌号" maxlength="200">${escapeHtml(saved.address || '')}</textarea>
              </div>
              <div class="field full">
                <label for="remark">订单备注</label>
                <input class="input" id="remark" name="remark" placeholder="选填，如：请放在门口快递柜" maxlength="200">
              </div>
            </div>
            <div class="deliver-note">${icon('truck', 16)} 预计 48 小时内发货，全国大部分地区包邮</div>
          </section>

          <section class="panel">
            <div class="panel-head"><span class="step-no">2</span><h2>支付方式</h2></div>
            <div class="pay-methods" id="checkout-methods">
              <label class="pay-option active" data-method="alipay">
                <input type="radio" name="payMethod" value="alipay" checked>
                <span class="pay-logo alipay">支</span>
                <span><strong>支付宝</strong><span>模拟支付</span></span>
              </label>
              <label class="pay-option" data-method="wechat">
                <input type="radio" name="payMethod" value="wechat">
                <span class="pay-logo wechat">微</span>
                <span><strong>微信支付</strong><span>模拟支付</span></span>
              </label>
              <label class="pay-option" data-method="card">
                <input type="radio" name="payMethod" value="card">
                <span class="pay-logo card">${icon('card', 16)}</span>
                <span><strong>银行卡</strong><span>模拟支付</span></span>
              </label>
            </div>
            <p class="summary-note" style="text-align:left;margin-top:14px">本项目为演示环境，不会产生真实扣款，订单支付状态由系统模拟写入。</p>
          </section>
        </div>

        <aside class="summary-card">
          <h2>商品清单</h2>
          <div class="checkout-items">
            ${selected
              .map(
                (item) => `
                <div class="checkout-item">
                  <span class="cart-thumb">${imageTag(item.image, item.name)}</span>
                  <div class="ci-info">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${money(item.price)} × ${item.quantity}</span>
                  </div>
                  <span class="ci-price">${money(item.price * item.quantity)}</span>
                </div>`
              )
              .join('')}
          </div>
          <div class="summary-row" style="margin-top:16px;border-top:1px dashed var(--line);padding-top:14px"><span>商品件数</span><b>${cart.summary.selectedCount} 件</b></div>
          <div class="summary-row"><span>商品金额</span><b>${money(total)}</b></div>
          <div class="summary-row"><span>运费</span><b>免运费</b></div>
          <div class="summary-total"><span>应付金额</span><strong><small>¥</small>${money(total).slice(1)}</strong></div>
          <button class="btn btn-accent btn-block" id="submit-order">提交订单并支付</button>
          <p class="summary-note">提交即表示同意《NOVA 商城服务条款》<br>未支付订单可在「我的订单」中继续支付</p>
        </aside>
      </div>
    </div>
  `;

  const methods = document.getElementById('checkout-methods');
  methods.querySelectorAll('.pay-option').forEach((option) => {
    option.addEventListener('click', () => {
      methods.querySelectorAll('.pay-option').forEach((item) => item.classList.remove('active'));
      option.classList.add('active');
      option.querySelector('input').checked = true;
    });
  });

  document.getElementById('submit-order').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const receiverName = document.getElementById('receiverName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const address = document.getElementById('address').value.trim();
    const remark = document.getElementById('remark').value.trim();
    const method = methods.querySelector('input[name="payMethod"]:checked').value;

    if (receiverName.length < 2) return toast('请填写收货人姓名', 'error');
    if (!/^1[3-9]\d{9}$/.test(phone)) return toast('请填写正确的 11 位手机号', 'error');
    if (address.length < 5) return toast('请填写详细收货地址', 'error');

    localStorage.setItem('nova_address', JSON.stringify({ receiverName, phone, address }));

    button.disabled = true;
    button.textContent = '正在提交…';
    try {
      const result = await api('/api/orders', {
        method: 'POST',
        body: {
          itemIds: selected.map((item) => item.id),
          receiverName,
          phone,
          address,
          remark,
        },
      });
      state.cart = result.cart;
      renderHeader();
      const paidOrder = await openPayment(result.order, method);
      if (paidOrder) {
        location.hash = `#/orders/${paidOrder.id}?paid=1`;
      } else {
        toast('订单已创建，可在「我的订单」中继续支付');
        location.hash = `#/orders/${result.order.id}`;
      }
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
      button.textContent = '提交订单并支付';
    }
  });
}

/* ------------------------------------------------------------------ */
/* 模拟支付                                                            */
/* ------------------------------------------------------------------ */

function openPayment(order, initialMethod = 'alipay') {
  return new Promise((resolve) => {
    let method = initialMethod;
    let settled = false;

    const modal = openModal({
      title: '收银台',
      size: 440,
      className: 'pay-modal',
      body: `
        <div class="amount">
          <span>订单号 ${escapeHtml(order.orderNo)}</span>
          <strong><small>¥</small>${money(order.total).slice(1)}</strong>
        </div>
        <div class="pay-methods" id="modal-methods">
          ${[
            ['alipay', '支', '支付宝'],
            ['wechat', '微', '微信支付'],
            ['card', icon('card', 15), '银行卡'],
          ]
            .map(
              ([value, logo, label]) => `
              <label class="pay-option ${value === method ? 'active' : ''}" data-method="${value}">
                <input type="radio" name="modalPay" value="${value}" ${value === method ? 'checked' : ''}>
                <span class="pay-logo ${value}">${logo}</span>
                <span><strong>${label}</strong><span>模拟支付</span></span>
              </label>`
            )
            .join('')}
        </div>
        <div class="pay-progress hidden" id="pay-progress">
          <div class="spinner"></div>
          <p style="font-size:13px;color:var(--muted)">正在与支付渠道通信，请稍候…</p>
        </div>
        <div class="pay-success hidden" id="pay-success">
          <div class="big-tick">${icon('check', 30)}</div>
          <h3 style="font-size:18px">支付成功</h3>
          <p style="font-size:12.5px;color:var(--muted);margin-top:4px">正在为你跳转到订单详情…</p>
        </div>
      `,
      footer: `
        <button class="btn btn-soft" data-act="later">稍后支付</button>
        <button class="btn btn-accent" data-act="pay">确认支付</button>
      `,
    });

    const finish = (value) => {
      if (settled) return;
      settled = true;
      modal.close();
      resolve(value);
    };

    const methodsEl = modal.el.querySelector('#modal-methods');
    methodsEl.querySelectorAll('.pay-option').forEach((option) => {
      option.addEventListener('click', () => {
        method = option.dataset.method;
        methodsEl.querySelectorAll('.pay-option').forEach((item) => item.classList.remove('active'));
        option.classList.add('active');
        option.querySelector('input').checked = true;
      });
    });

    modal.el.querySelector('[data-act="later"]').addEventListener('click', () => finish(null));
    modal.el.querySelector('.modal-close').addEventListener('click', () => finish(null));

    const payButton = modal.el.querySelector('[data-act="pay"]');
    payButton.addEventListener('click', async () => {
      payButton.disabled = true;
      payButton.textContent = '支付中…';
      methodsEl.classList.add('hidden');
      modal.el.querySelector('#pay-progress').classList.remove('hidden');
      try {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const paid = await api(`/api/orders/${order.id}/pay`, { method: 'POST', body: { method } });
        modal.el.querySelector('#pay-progress').classList.add('hidden');
        modal.el.querySelector('#pay-success').classList.remove('hidden');
        modal.el.querySelector('.modal-foot').classList.add('hidden');
        toast('支付成功，感谢你的购买');
        setTimeout(() => finish(paid), 1100);
      } catch (error) {
        toast(error.message, 'error');
        methodsEl.classList.remove('hidden');
        modal.el.querySelector('#pay-progress').classList.add('hidden');
        payButton.disabled = false;
        payButton.textContent = '确认支付';
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* 我的订单                                                            */
/* ------------------------------------------------------------------ */

async function renderOrders(params) {
  const status = params.get('status') || 'all';
  const orders = await api(`/api/orders${status === 'all' ? '' : `?status=${status}`}`);

  const tabs = [
    ['all', '全部订单'],
    ['pending', '待付款'],
    ['paid', '待发货'],
    ['shipped', '待收货'],
    ['completed', '已完成'],
    ['cancelled', '已取消'],
  ];

  view.innerHTML = `
    <div class="container">
      <div class="breadcrumb"><a href="#/">首页</a><span class="sep">/</span><span>我的订单</span></div>
      <div class="page-head"><h1>我的订单</h1><p>共 ${orders.length} 笔订单，点击订单可查看物流与支付详情</p></div>
      <div class="orders-toolbar">
        ${tabs
          .map(
            ([value, label]) =>
              `<button type="button" data-status="${value}" class="${status === value ? 'active' : ''}">${label}</button>`
          )
          .join('')}
      </div>

      ${
        orders.length
          ? orders.map(orderCardHtml).join('')
          : `<div style="padding:10px 0 20px">${emptyState({
              iconName: 'package',
              title: '这里还没有订单',
              text: '挑选喜欢的商品下单后，就可以在这里查看订单状态与物流信息。',
              actionText: '去逛逛',
              actionHref: '#/products',
            })}</div>`
      }
    </div>
  `;

  view.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = button.dataset.status === 'all' ? '#/orders' : `#/orders?status=${button.dataset.status}`;
    });
  });

  bindOrderActions(orders);
}

function orderCardHtml(order) {
  const status = ORDER_STATUS[order.status] || ORDER_STATUS.pending;
  const preview = order.items.slice(0, 4);
  const extra = order.items.length - preview.length;

  const actions = [];
  actions.push(`<a class="btn btn-ghost" href="#/orders/${order.id}">查看详情</a>`);
  if (order.status === 'pending') {
    actions.push(`<button class="btn btn-soft" data-cancel="${order.id}">取消订单</button>`);
    actions.push(`<button class="btn btn-accent" data-pay-order="${order.id}">去支付</button>`);
  }
  if (order.status === 'shipped') {
    actions.push(`<button class="btn btn-primary" data-confirm="${order.id}">确认收货</button>`);
  }
  if (order.status === 'completed' || order.status === 'cancelled') {
    actions.push(`<button class="btn btn-soft" data-rebuy="${order.id}">再次购买</button>`);
  }

  return `
    <article class="order-card">
      <div class="order-card-head">
        <span class="order-no">${escapeHtml(order.orderNo)}</span>
        <span>${formatDateTime(order.createdAt)}</span>
        <span class="spacer"></span>
        <span class="status-badge ${status.cls}">${status.label}</span>
      </div>
      <div class="order-card-body">
        <div class="order-items-preview">
          ${preview
            .map(
              (item) => `
              <a class="order-thumb" href="#/orders/${order.id}">
                ${imageTag(item.image, item.name)}
                <span class="qty">×${item.quantity}</span>
              </a>`
            )
            .join('')}
          ${extra > 0 ? `<span class="order-thumb" style="display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted)">+${extra}</span>` : ''}
        </div>
        <div class="order-summary-side">
          <span>共 ${order.itemCount} 件商品</span>
          <strong>${money(order.total)}</strong>
        </div>
      </div>
      <div class="order-card-foot">${actions.join('')}</div>
    </article>
  `;
}

function bindOrderActions(orders) {
  const findOrder = (id) => orders.find((order) => String(order.id) === String(id));

  view.querySelectorAll('[data-pay-order]').forEach((button) => {
    button.addEventListener('click', async () => {
      const order = findOrder(button.dataset.payOrder);
      if (!order) return;
      const paid = await openPayment(order);
      if (paid) {
        toast('支付成功');
        await refreshCart();
        router();
      }
    });
  });

  view.querySelectorAll('[data-cancel]').forEach((button) => {
    button.addEventListener('click', async () => {
      const order = findOrder(button.dataset.cancel);
      const ok = await confirmDialog({
        title: '取消订单',
        message: `确定取消订单 ${order ? order.orderNo : ''} 吗？取消后库存会自动释放。`,
        confirmText: '确认取消',
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/orders/${button.dataset.cancel}/cancel`, { method: 'POST' });
        toast('订单已取消');
        router();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });

  view.querySelectorAll('[data-confirm]').forEach((button) => {
    button.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '确认收货',
        message: '确认已收到商品？确认后订单将标记为已完成。',
        confirmText: '确认收货',
      });
      if (!ok) return;
      try {
        await api(`/api/orders/${button.dataset.confirm}/confirm`, { method: 'POST' });
        toast('已确认收货，感谢你的信任');
        router();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });

  view.querySelectorAll('[data-rebuy]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!requireLogin()) return;
      const order = findOrder(button.dataset.rebuy);
      if (!order) return;
      button.disabled = true;
      try {
        for (const item of order.items) {
          await api('/api/cart/items', {
            method: 'POST',
            body: { productId: item.productId, quantity: item.quantity },
          });
        }
        state.cart = await api('/api/cart');
        renderHeader();
        toast('已将商品加入购物车');
        location.hash = '#/cart';
      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* 订单详情                                                            */
/* ------------------------------------------------------------------ */

async function renderOrderDetail(id, params) {
  const order = await api(`/api/orders/${id}`);
  const status = ORDER_STATUS[order.status] || ORDER_STATUS.pending;
  const justPaid = params.get('paid') === '1' && ['paid', 'shipped', 'completed'].includes(order.status);

  const steps = [
    ['提交订单', order.createdAt],
    ['付款成功', order.paidAt],
    ['商品出库', order.shippedAt],
    ['交易完成', order.completedAt],
  ];
  const doneIndex = order.status === 'cancelled' ? 0 : steps.filter(([, time]) => !!time).length - 1;

  view.innerHTML = `
    <div class="container">
      <div class="breadcrumb"><a href="#/orders">我的订单</a><span class="sep">/</span><span>${escapeHtml(order.orderNo)}</span></div>

      ${justPaid ? `<div class="success-banner"><span class="tick">${icon('check', 22)}</span><div><strong>支付成功</strong><span>我们已收到你的付款，商品将在 48 小时内发出。</span></div></div>` : ''}

      <div class="page-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <h1>订单详情</h1>
          <p>订单号 ${escapeHtml(order.orderNo)} · 下单时间 ${formatDateTime(order.createdAt, true)}</p>
        </div>
        <span class="status-badge ${status.cls}" style="font-size:12.5px;padding:7px 14px">${status.label}</span>
      </div>

      <div class="order-detail-grid">
        <div>
          <section class="panel">
            <div class="timeline">
              ${steps
                .map(
                  ([label, time], index) => `
                  <div class="timeline-step ${index <= doneIndex && !(order.status === 'cancelled' && index > 0) ? 'done' : ''}">
                    <span class="dot"></span>
                    <strong style="font-weight:600">${label}</strong>
                    <div style="font-size:10.5px;color:var(--muted-2);margin-top:2px">${time ? escapeHtml(formatDateTime(time)) : '—'}</div>
                  </div>`
                )
                .join('')}
            </div>
            ${
              order.status === 'cancelled'
                ? `<div class="deliver-note" style="background:#f4f1ed;color:var(--muted)">${icon('alert', 16)} 该订单已于 ${formatDateTime(order.cancelledAt)} 取消，商品库存已释放。</div>`
                : order.status === 'shipped'
                  ? `<div class="deliver-note">${icon('truck', 16)} 商品已出库，正在配送途中，请注意查收。</div>`
                  : order.status === 'pending'
                    ? `<div class="deliver-note" style="background:var(--amber-soft);color:var(--amber)">${icon('clock', 16)} 等待支付，请尽快完成付款以保留库存。</div>`
                    : ''
            }
          </section>

          <section class="panel">
            <div class="panel-head"><h2>商品清单</h2><span class="result-meta" style="margin-left:auto">共 ${order.itemCount} 件</span></div>
            ${order.items
              .map(
                (item) => `
                <div class="order-line">
                  <span class="cart-thumb">${imageTag(item.image, item.name)}</span>
                  <div class="ol-name">
                    <a href="#/product/${item.productId}">${escapeHtml(item.name)}</a>
                    <span>${money(item.price)} × ${item.quantity}</span>
                  </div>
                  <span class="ol-price">${money(item.subtotal)}</span>
                </div>`
              )
              .join('')}
            <div class="summary-row" style="margin-top:14px"><span>商品金额</span><b>${money(order.total)}</b></div>
            <div class="summary-row"><span>运费</span><b>免运费</b></div>
            <div class="summary-total" style="margin-bottom:0"><span>实付金额</span><strong><small>¥</small>${money(order.total).slice(1)}</strong></div>
          </section>
        </div>

        <aside>
          <section class="panel">
            <div class="panel-head"><h2>收货信息</h2></div>
            <div class="info-block" style="padding-top:0">
              <p><b>${escapeHtml(order.receiverName)}</b> · ${escapeHtml(order.phone)}</p>
              <p>${escapeHtml(order.address)}</p>
              ${order.remark ? `<p style="margin-top:6px">备注：${escapeHtml(order.remark)}</p>` : ''}
            </div>
            <div class="info-block">
              <h3>订单信息</h3>
              <p>订单编号：${escapeHtml(order.orderNo)}</p>
              <p>创建时间：${formatDateTime(order.createdAt, true)}</p>
              ${order.paidAt ? `<p>支付时间：${formatDateTime(order.paidAt, true)}</p>` : ''}
              ${order.shippedAt ? `<p>发货时间：${formatDateTime(order.shippedAt, true)}</p>` : ''}
            </div>
            ${
              order.payments.length
                ? `<div class="info-block">
                    <h3>支付记录</h3>
                    ${order.payments
                      .map(
                        (payment) => `<p>${payMethodLabel[payment.method] || payment.method} · ${money(payment.amount)} · ${
                          payment.status === 'success' ? '支付成功' : payment.status === 'refunded' ? '已退款' : '退款流水'
                        }<br><span style="font-size:11px">流水号 ${escapeHtml(payment.transactionNo)}</span></p>`
                      )
                      .join('')}
                  </div>`
                : ''
            }
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:18px">
              ${order.status === 'pending' ? `<button class="btn btn-accent btn-block" data-pay-order="${order.id}">去支付</button>` : ''}
              ${order.status === 'pending' ? `<button class="btn btn-soft btn-block" data-cancel="${order.id}">取消订单</button>` : ''}
              ${order.status === 'shipped' ? `<button class="btn btn-primary btn-block" data-confirm="${order.id}">确认收货</button>` : ''}
              <a class="btn btn-ghost btn-block" href="#/orders">返回订单列表</a>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;

  bindOrderActions([order]);
}

/* ------------------------------------------------------------------ */
/* 登录 / 注册                                                         */
/* ------------------------------------------------------------------ */

function authAsideHtml() {
  return `
    <aside class="auth-aside">
      <span class="eyebrow">NOVA PC</span>
      <h1>从一颗显卡开始，<br>配出<em>你的主机</em>。</h1>
      <p>登录后可同步购物车、查看订单状态，并享受装机顾问与专属售后。整个过程只需要几秒钟。</p>
      <ul class="auth-perks">
        <li>${icon('checkCircle', 17)} 顺丰包邮，48 小时极速发货</li>
        <li>${icon('checkCircle', 17)} 7 天无理由退换与三年质保</li>
        <li>${icon('checkCircle', 17)} 订单状态实时更新，售后一键申请</li>
      </ul>
      <div class="auth-quote">“配件型号标得很清楚，客服还帮我核对了电源和显卡长度，装机一次点亮。”<br><span style="color:var(--muted-2)">—— 来自真实用户的评价</span></div>
    </aside>
  `;
}

function finishLogin(user) {
  state.user = user;
  refreshCart();
  toast(`欢迎回来，${user.username}`);
  const redirect = sessionStorage.getItem('nova_redirect') || '#/';
  sessionStorage.removeItem('nova_redirect');
  if (location.hash === redirect) {
    router();
  } else {
    location.hash = redirect;
  }
}

async function renderLogin() {
  view.innerHTML = `
    <div class="auth-wrap">
      ${authAsideHtml()}
      <div class="auth-main">
        <div class="auth-card">
          <h2>欢迎回来</h2>
          <p class="lead">登录你的 NOVA 账号，继续未完成的购物</p>
          <form class="auth-form" id="login-form" novalidate>
            <div class="field">
              <label for="account">用户名 / 邮箱</label>
              <input class="input" id="account" name="account" placeholder="请输入用户名或邮箱" autocomplete="username">
            </div>
            <div class="field">
              <label for="password">密码</label>
              <input class="input" id="password" name="password" type="password" placeholder="请输入密码" autocomplete="current-password">
            </div>
            <button class="btn btn-primary btn-block" type="submit">登录</button>
          </form>
          <div class="demo-hint">
            <b>演示账号</b><br>
            普通用户 zhangwei / 123456 <button type="button" data-fill="user">填入</button><br>
            管理员 admin / admin123 <button type="button" data-fill="admin">填入</button>
          </div>
          <p class="auth-switch">还没有账号？<a href="#/register">立即注册</a></p>
        </div>
      </div>
    </div>
  `;

  view.querySelectorAll('[data-fill]').forEach((button) => {
    button.addEventListener('click', () => {
      const isAdmin = button.dataset.fill === 'admin';
      document.getElementById('account').value = isAdmin ? 'admin' : 'zhangwei';
      document.getElementById('password').value = isAdmin ? 'admin123' : '123456';
    });
  });

  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const account = document.getElementById('account').value.trim();
    const password = document.getElementById('password').value;
    if (!account || !password) return toast('请输入账号和密码', 'error');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = '登录中…';
    try {
      const user = await api('/api/auth/login', { method: 'POST', body: { account, password } });
      finishLogin(user);
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
      button.textContent = '登录';
    }
  });
}

async function renderRegister() {
  view.innerHTML = `
    <div class="auth-wrap">
      ${authAsideHtml()}
      <div class="auth-main">
        <div class="auth-card">
          <h2>创建账号</h2>
          <p class="lead">注册后即可加入购物车并创建订单</p>
          <form class="auth-form" id="register-form" novalidate>
            <div class="field">
              <label for="username">用户名</label>
              <input class="input" id="username" name="username" placeholder="3-20 位字母、数字或中文" autocomplete="username">
            </div>
            <div class="field">
              <label for="email">邮箱</label>
              <input class="input" id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email">
            </div>
            <div class="field">
              <label for="password">密码</label>
              <input class="input" id="password" name="password" type="password" placeholder="至少 6 位字符" autocomplete="new-password">
            </div>
            <div class="field">
              <label for="password2">确认密码</label>
              <input class="input" id="password2" name="password2" type="password" placeholder="再次输入密码" autocomplete="new-password">
            </div>
            <button class="btn btn-primary btn-block" type="submit">注册并登录</button>
          </form>
          <p class="auth-switch">已有账号？<a href="#/login">去登录</a></p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const password2 = document.getElementById('password2').value;
    if (!username) return toast('请输入用户名', 'error');
    if (!email) return toast('请输入邮箱', 'error');
    if (password.length < 6) return toast('密码至少 6 位', 'error');
    if (password !== password2) return toast('两次输入的密码不一致', 'error');

    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = '注册中…';
    try {
      const user = await api('/api/auth/register', { method: 'POST', body: { username, email, password } });
      finishLogin(user);
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
      button.textContent = '注册并登录';
    }
  });
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

const routes = [
  { test: /^\/$/, handler: () => renderHome() },
  { test: /^\/products$/, handler: (match, params) => renderProducts(params) },
  { test: /^\/product\/(\d+)$/, handler: (match) => renderProduct(match[1]) },
  { test: /^\/cart$/, handler: () => renderCart(), auth: true },
  { test: /^\/checkout$/, handler: () => renderCheckout(), auth: true },
  { test: /^\/orders$/, handler: (match, params) => renderOrders(params), auth: true },
  { test: /^\/orders\/(\d+)$/, handler: (match, params) => renderOrderDetail(match[1], params), auth: true },
  { test: /^\/login$/, handler: () => renderLogin() },
  { test: /^\/register$/, handler: () => renderRegister() },
];

let routing = false;

async function router() {
  if (routing) return;
  routing = true;
  const { path, params } = parseHash();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  renderHeader();

  const route = routes.find((item) => item.test.test(path));
  if (!route) {
    view.innerHTML = `<div class="container"><div style="padding:70px 0">${emptyState({
      iconName: 'alert',
      title: '页面不存在',
      text: '你访问的页面可能已被移动或删除。',
      actionText: '返回首页',
      actionHref: '#/',
    })}</div></div>`;
    routing = false;
    return;
  }

  if (route.auth && !state.user) {
    sessionStorage.setItem('nova_redirect', location.hash || '#/');
    routing = false;
    location.hash = '#/login';
    toast('请先登录', 'error');
    return;
  }

  try {
    await route.handler(path.match(route.test), params);
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      routing = false;
      location.hash = '#/login';
      toast('登录状态已失效，请重新登录', 'error');
      return;
    }
    view.innerHTML = `<div class="container"><div style="padding:70px 0">${emptyState({
      iconName: 'alert',
      title: '页面加载失败',
      text: error.message || '网络异常，请稍后重试。',
      actionText: '重新加载',
      actionHref: location.hash || '#/',
    })}</div></div>`;
  } finally {
    routing = false;
  }
}

/* 全局事件 */
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  event.preventDefault();
  if (!requireLogin()) return;
  button.disabled = true;
  addToCart(Number(button.dataset.add), 1).finally(() => {
    button.disabled = false;
  });
});

document.getElementById('header-search').addEventListener('submit', (event) => {
  event.preventDefault();
  const keyword = new FormData(event.currentTarget).get('q').trim();
  location.hash = currentHashWith({ keyword });
  event.currentTarget.reset();
});

window.addEventListener('hashchange', router);

(async function bootstrap() {
  try {
    state.user = await api('/api/auth/me');
  } catch {
    state.user = null;
  }
  if (state.user) await refreshCart();
  else renderHeader();
  await router();
})();
