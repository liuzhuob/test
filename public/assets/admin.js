import {
  api,
  icon,
  money,
  escapeHtml,
  toast,
  openModal,
  confirmDialog,
  formatDateTime,
  ORDER_STATUS,
  payMethodLabel,
} from './ui.js?v=20261113';

/* ------------------------------------------------------------------ */
/* 基础状态                                                             */
/* ------------------------------------------------------------------ */

const state = { user: null, categories: [], started: false };
const productFilters = { keyword: '', categoryId: '', status: 'all', page: 1 };
const orderFilters = { status: 'all', keyword: '', page: 1 };
const userFilters = { keyword: '' };
const inventoryFilters = { keyword: '', low: false };
const salesRange = { days: 30 };

const app = document.getElementById('app');
const viewEl = () => document.getElementById('admin-view');

const MENU = [
  ['dashboard', '数据概览', 'grid'],
  ['products', '商品管理', 'package'],
  ['categories', '分类管理', 'layers'],
  ['orders', '订单管理', 'inbox'],
  ['users', '用户管理', 'users'],
  ['inventory', '库存管理', 'archive'],
  ['sales', '销售统计', 'chart'],
];

const CATEGORY_ICONS = [
  ['pc', '整机方案'],
  ['cpu', 'CPU 处理器'],
  ['gpu', '显卡'],
  ['mb', '主板'],
  ['ram', '内存'],
  ['ssd', '固态硬盘'],
  ['cooling', '散热系统'],
  ['case', '机箱'],
  ['psu', '电源'],
];

function setPage(title, sub = '') {
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-sub');
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
}

function todayLabel() {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
}

function statusBadge(status) {
  const meta = ORDER_STATUS[status] || ORDER_STATUS.pending;
  return `<span class="status-badge ${meta.cls}">${meta.label}</span>`;
}

function productThumb(product, size = 42) {
  if (!product.image) return `<span class="ph" style="width:${size}px;height:${size}px"></span>`;
  return `<img src="${escapeHtml(product.image)}" alt="" style="width:${size}px;height:${size}px" onerror="this.style.display='none'">`;
}

function pagerHtml(page, pages, total) {
  let start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  start = Math.max(1, end - 4);
  const numbers = [];
  for (let index = start; index <= end; index += 1) numbers.push(index);
  return `<div class="pager">
    <span class="pager-info">第 ${page} / ${pages} 页 · 共 ${total} 条</span>
    <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
    ${numbers.map((n) => `<button type="button" data-page="${n}" class="${n === page ? 'active' : ''}">${n}</button>`).join('')}
    <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>下一页</button>
  </div>`;
}

function bindPager(root, onChange) {
  root.querySelectorAll('.pager [data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = Number(button.dataset.page);
      if (next >= 1) onChange(next);
    });
  });
}

function emptyBlock(title, text) {
  return `<div class="admin-empty">
    <div class="ae-icon">${icon('inbox', 24)}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(text)}</p>
  </div>`;
}

function loadingBlock() {
  return `<div class="card"><div class="admin-empty">
    <div class="spinner" style="border-color:#ece5db;border-top-color:var(--accent)"></div>
    <p>正在加载数据…</p>
  </div></div>`;
}

const shortYuan = (cents) => {
  const value = Number(cents || 0) / 100;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(Math.round(value));
};

/* ------------------------------------------------------------------ */
/* 图表                                                                */
/* ------------------------------------------------------------------ */

function barChart(trend) {
  const width = 760;
  const height = 235;
  const pad = { l: 8, r: 8, t: 24, b: 32 };
  const max = Math.max(1, ...trend.map((item) => item.revenue));
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const step = innerW / trend.length;
  const barW = Math.min(46, step * 0.46);

  const bars = trend
    .map((item, index) => {
      const barH = Math.max(item.revenue > 0 ? 5 : 2, (item.revenue / max) * innerH);
      const x = pad.l + step * index + (step - barW) / 2;
      const y = pad.t + innerH - barH;
      const isLast = index === trend.length - 1;
      return `<g>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="6"
          fill="${isLast ? '#d9552f' : '#ebe4da'}"><title>${item.date} · ${money(item.revenue)} · ${item.orders} 单</title></rect>
        ${item.revenue ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" font-size="10" fill="#857b71">${shortYuan(item.revenue)}</text>` : ''}
        <text x="${(x + barW / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#a79d93">${item.date.slice(5)}</text>
      </g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="销售趋势">${bars}</svg>`;
}

function areaChart(trend) {
  const width = 920;
  const height = 280;
  const pad = { l: 10, r: 10, t: 26, b: 30 };
  const max = Math.max(1, ...trend.map((item) => item.revenue));
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const step = innerW / Math.max(1, trend.length - 1);
  const points = trend.map((item, index) => [
    pad.l + step * index,
    pad.t + innerH - (item.revenue / max) * innerH,
  ]);
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1];
  const area = `${line} L ${last[0].toFixed(1)} ${pad.t + innerH} L ${points[0][0].toFixed(1)} ${pad.t + innerH} Z`;
  const every = Math.max(1, Math.ceil(trend.length / 7));

  const grids = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (ratio) =>
        `<line x1="${pad.l}" x2="${width - pad.r}" y1="${(pad.t + innerH * ratio).toFixed(1)}" y2="${(pad.t + innerH * ratio).toFixed(1)}" stroke="#f0ebe3" stroke-dasharray="3 5"/>`
    )
    .join('');
  const labels = trend
    .map((item, index) =>
      index % every === 0 || index === trend.length - 1
        ? `<text x="${points[index][0].toFixed(1)}" y="${height - 9}" text-anchor="middle" font-size="10" fill="#a79d93">${item.date.slice(5)}</text>`
        : ''
    )
    .join('');
  const dots = trend
    .map((item, index) =>
      index === trend.length - 1 && item.revenue
        ? `<circle cx="${points[index][0].toFixed(1)}" cy="${points[index][1].toFixed(1)}" r="4.5" fill="#d9552f" stroke="#fff" stroke-width="2"/>
           <text x="${(points[index][0] - 8).toFixed(1)}" y="${(points[index][1] - 12).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#17130f" font-weight="600">${money(item.revenue)}</text>`
        : ''
    )
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="销售走势">
    <defs>
      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d9552f" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="#d9552f" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grids}
    <path d="${area}" fill="url(#areaFill)"/>
    <path d="${line}" fill="none" stroke="#d9552f" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

function statusDistribution(counts) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0) || 1;
  const order = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
  const colors = {
    pending: 'var(--amber)',
    paid: 'var(--blue)',
    shipped: 'var(--violet)',
    completed: 'var(--green)',
    cancelled: 'var(--muted-2)',
  };
  return `<div class="status-list">${order
    .map((key) => {
      const count = counts[key] || 0;
      const meta = ORDER_STATUS[key];
      return `<div class="status-row">
        <span class="sr-label">${meta.label}</span>
        <span class="sr-track"><span class="sr-bar" style="width:${Math.round((count / total) * 100)}%;background:${colors[key]}"></span></span>
        <span class="sr-value">${count}</span>
      </div>`;
    })
    .join('')}</div>`;
}

/* ------------------------------------------------------------------ */
/* 登录 / 外壳                                                          */
/* ------------------------------------------------------------------ */

function renderAuth(message = '') {
  app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-visual">
        <div class="wordmark">NOVA<span>ADMIN CONSOLE</span></div>
        <div>
          <h2>让每一次<br>经营决策都有据可依。</h2>
          <p>商品、订单、库存与销售数据集中在一个工作台，帮助你把店铺打理得井井有条。</p>
          <div class="features">
            <span>${icon('checkCircle', 16)} 实时销售看板与趋势分析</span>
            <span>${icon('checkCircle', 16)} 订单流转与库存预警</span>
            <span>${icon('checkCircle', 16)} 商品与分类的可视化管理</span>
          </div>
        </div>
        <div style="font-size:11px;color:rgba(245,237,226,.4)">© 2026 NOVA PC · 内部管理系统</div>
      </div>
      <div class="auth-form-side">
        <div class="auth-form-card">
          <h1>管理员登录</h1>
          <p class="lead">请使用管理员账号进入 NOVA PC 管理后台</p>
          ${message ? `<div class="deliver-note" style="background:#fdf0eb;color:var(--accent-dark);margin-bottom:16px">${icon('alert', 15)} ${escapeHtml(message)}</div>` : ''}
          <form id="admin-login">
            <div class="field">
              <label for="admin-account">管理员账号</label>
              <input class="input" id="admin-account" autocomplete="username" placeholder="请输入账号" value="admin">
            </div>
            <div class="field">
              <label for="admin-password">密码</label>
              <input class="input" id="admin-password" type="password" autocomplete="current-password" placeholder="请输入密码">
            </div>
            <button class="btn btn-primary btn-block" type="submit">进入后台</button>
          </form>
          <div class="demo-hint" style="margin-top:18px">
            <b>演示管理员</b> admin / admin123
            <button type="button" id="fill-admin">一键填入</button>
          </div>
          <p class="auth-back"><a href="/">返回商城首页</a></p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('fill-admin').addEventListener('click', () => {
    document.getElementById('admin-account').value = 'admin';
    document.getElementById('admin-password').value = 'admin123';
  });

  document.getElementById('admin-login').addEventListener('submit', async (event) => {
    event.preventDefault();
    const account = document.getElementById('admin-account').value.trim();
    const password = document.getElementById('admin-password').value;
    if (!account || !password) return toast('请输入账号和密码', 'error');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = '登录中…';
    try {
      const user = await api('/api/auth/login', { method: 'POST', body: { account, password } });
      if (user.role !== 'admin') {
        await api('/api/auth/logout', { method: 'POST' });
        throw new Error('该账号没有管理员权限，请使用管理员账号登录');
      }
      state.user = user;
      toast('登录成功');
      await startApp();
    } catch (error) {
      toast(error.message, 'error');
      renderAuth(error.message);
    }
  });
}

function renderShell() {
  app.innerHTML = `
    <div class="admin-layout">
      <aside class="sidebar">
        <div class="side-brand">NOVA<span>ADMIN CONSOLE</span></div>
        <nav class="side-nav">
          ${MENU.map(
            ([key, label, iconName]) =>
              `<a href="#/${key}" data-menu="${key}">${icon(iconName, 17)}<span>${label}</span></a>`
          ).join('')}
        </nav>
        <div class="side-footer">
          <a class="side-link" href="/">${icon('store', 15)} 返回商城</a>
          <div class="side-user">
            <span class="avatar">${escapeHtml(state.user.username.slice(0, 1).toUpperCase())}</span>
            <div class="su-info">
              <strong>${escapeHtml(state.user.username)}</strong>
              <span>超级管理员</span>
            </div>
            <button type="button" id="admin-logout" aria-label="退出登录">${icon('logout', 15)}</button>
          </div>
        </div>
      </aside>
      <main class="admin-main">
        <header class="topbar">
          <div>
            <h1 id="page-title">数据概览</h1>
            <p id="page-sub">店铺经营一览</p>
          </div>
          <div class="topbar-side">
            <span class="topbar-date">${icon('clock', 14)} ${todayLabel()}</span>
            <span class="topbar-admin">
              <span class="avatar">${escapeHtml(state.user.username.slice(0, 1).toUpperCase())}</span>
              ${escapeHtml(state.user.username)}
            </span>
          </div>
        </header>
        <div id="admin-view"></div>
      </main>
    </div>
  `;

  document.getElementById('admin-logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    renderAuth();
    toast('已退出登录');
  });
}

async function loadCategories() {
  state.categories = await api('/api/admin/categories');
}

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  return (raw.split('?')[0] || 'dashboard').trim();
}

async function router() {
  if (!state.user) return;
  const route = currentRoute();
  document.querySelectorAll('[data-menu]').forEach((link) => {
    link.classList.toggle('active', link.dataset.menu === route);
  });
  const handlers = {
    dashboard: renderDashboard,
    products: renderProducts,
    categories: renderCategories,
    orders: renderOrders,
    users: renderUsers,
    inventory: renderInventory,
    sales: renderSales,
  };
  const handler = handlers[route] || renderDashboard;
  try {
    await handler();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      state.user = null;
      renderAuth('登录状态已失效，请重新登录');
      return;
    }
    viewEl().innerHTML = `<div class="card">${emptyBlock('页面加载失败', error.message)}</div>`;
  }
}

async function startApp() {
  await loadCategories();
  renderShell();
  if (!state.started) {
    state.started = true;
    window.addEventListener('hashchange', router);
  }
  await router();
}

/* ------------------------------------------------------------------ */
/* 数据概览                                                            */
/* ------------------------------------------------------------------ */

async function renderDashboard() {
  setPage('数据概览', '店铺经营一览，数据实时更新');
  viewEl().innerHTML = loadingBlock();
  const data = await api('/api/admin/stats');
  const totals = data.totals;

  const kpi = (label, value, foot, cls = '', iconName = 'chart') => `
    <div class="kpi ${cls}">
      <span class="k-label">${icon(iconName, 14)} ${label}</span>
      <span class="k-value">${value}</span>
      <span class="k-foot">${foot}</span>
    </div>`;

  viewEl().innerHTML = `
    <div class="kpi-grid">
      ${kpi('累计销售额', money(totals.revenue), `今日 ${money(data.today.revenue)}`, 'dark', 'wallet')}
      ${kpi('订单总量', `${totals.orders} 单`, `今日新增 ${data.today.orders} 单`, '', 'inbox')}
      ${kpi('待发货订单', `${totals.pendingShip} 单`, '支付成功，等待出库', 'warn', 'truck')}
      ${kpi('低库存商品', `${totals.lowStock} 件`, '库存 ≤ 20 件，需要补货', totals.lowStock ? 'danger' : '', 'alert')}
    </div>
    <div class="mini-grid">
      <div class="mini-stat"><span class="ms-icon">${icon('users', 17)}</span><div><strong>${totals.users}</strong><span>注册用户 · 今日 +${data.today.users}</span></div></div>
      <div class="mini-stat"><span class="ms-icon">${icon('package', 17)}</span><div><strong>${totals.products}</strong><span>商品总数</span></div></div>
      <div class="mini-stat"><span class="ms-icon">${icon('clock', 17)}</span><div><strong>${totals.pendingPayment}</strong><span>待付款订单</span></div></div>
      <div class="mini-stat"><span class="ms-icon">${icon('chart', 17)}</span><div><strong>${money(data.today.revenue)}</strong><span>今日销售额</span></div></div>
    </div>

    <div class="dash-grid">
      <div class="card">
        <div class="card-head"><h3>近 7 天销售趋势</h3><span class="meta">已支付订单金额</span></div>
        ${barChart(data.trend)}
      </div>
      <div class="card">
        <div class="card-head"><h3>订单状态分布</h3><span class="meta">全部订单</span></div>
        ${statusDistribution(data.statusCounts)}
        <div class="card-head" style="margin:20px 0 0"><h3 style="font-size:13px">库存预警</h3><a href="#/inventory">去处理 ${icon('chevronRight', 13)}</a></div>
        ${
          data.lowStockList.length
            ? `<div class="rank-list" style="margin-top:6px">${data.lowStockList
                .slice(0, 4)
                .map(
                  (item) => `<div class="rank-item">
                    ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" onerror="this.style.display='none'">` : '<span class="ph"></span>'}
                    <div class="ri-info"><strong>${escapeHtml(item.name)}</strong><span>剩余 ${item.stock} 件</span></div>
                    <span class="badge ${item.stock === 0 ? 'danger' : 'warn'}">${item.stock === 0 ? '缺货' : '偏低'}</span>
                  </div>`
                )
                .join('')}</div>`
            : '<p class="muted" style="font-size:12px;padding:14px 0">目前库存充足，暂无预警商品。</p>'
        }
      </div>
    </div>

    <div class="dash-grid equal">
      <div class="card">
        <div class="card-head"><h3>热销商品 TOP 5</h3><a href="#/sales">销售分析 ${icon('chevronRight', 13)}</a></div>
        ${
          data.topProducts.length
            ? `<div class="rank-list">${data.topProducts
                .map(
                  (item, index) => `<div class="rank-item">
                    <span class="rk ${index === 0 ? 'top' : ''}">${String(index + 1).padStart(2, '0')}</span>
                    ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" onerror="this.style.display='none'">` : '<span class="ph"></span>'}
                    <div class="ri-info"><strong>${escapeHtml(item.name)}</strong><span>售出 ${item.quantity} 件</span></div>
                    <span class="ri-value">${money(item.revenue)}</span>
                  </div>`
                )
                .join('')}</div>`
            : '<p class="muted" style="font-size:12px">暂无销售数据</p>'
        }
      </div>
      <div class="card">
        <div class="card-head"><h3>最新订单</h3><a href="#/orders">全部订单 ${icon('chevronRight', 13)}</a></div>
        ${
          data.recentOrders.length
            ? `<div class="table-wrap" style="margin:0 -8px;padding:0 8px">
                <table class="admin-table" style="min-width:0">
                  <thead><tr><th>订单号</th><th>用户</th><th class="num">金额</th><th>状态</th></tr></thead>
                  <tbody>${data.recentOrders
                    .map(
                      (order) => `<tr data-order="${order.id}" style="cursor:pointer">
                        <td class="nowrap">${escapeHtml(order.orderNo.slice(-10))}<br><span class="muted">${formatDateTime(order.createdAt)}</span></td>
                        <td>${escapeHtml(order.username || '—')}</td>
                        <td class="num">${money(order.total)}</td>
                        <td>${statusBadge(order.status)}</td>
                      </tr>`
                    )
                    .join('')}</tbody>
                </table>
              </div>`
            : emptyBlock('暂无订单', '用户下单后会在这里显示')
        }
      </div>
    </div>
  `;

  viewEl().querySelectorAll('[data-order]').forEach((row) => {
    row.addEventListener('click', () => openOrderModal(Number(row.dataset.order)));
  });
}

/* ------------------------------------------------------------------ */
/* 商品管理                                                            */
/* ------------------------------------------------------------------ */

async function renderProducts() {
  setPage('商品管理', '维护商品信息、价格、库存与上下架状态');
  const view = viewEl();
  view.innerHTML = loadingBlock();
  if (!state.categories.length) await loadCategories();

  const query = new URLSearchParams({ page: String(productFilters.page), pageSize: '10' });
  if (productFilters.keyword) query.set('keyword', productFilters.keyword);
  if (productFilters.categoryId) query.set('categoryId', productFilters.categoryId);
  if (productFilters.status !== 'all') query.set('status', productFilters.status);
  const data = await api(`/api/admin/products?${query.toString()}`);

  view.innerHTML = `
    <div class="card">
      <div class="filter-bar">
        <div class="search-field">
          ${icon('search', 15)}
          <input class="input" id="product-search" placeholder="搜索商品名称，回车确认" value="${escapeHtml(productFilters.keyword)}">
        </div>
        <select class="select" id="filter-category">
          <option value="">全部分类</option>
          ${state.categories
            .map(
              (category) =>
                `<option value="${category.id}" ${String(productFilters.categoryId) === String(category.id) ? 'selected' : ''}>${escapeHtml(category.name)}</option>`
            )
            .join('')}
        </select>
        <select class="select" id="filter-status">
          <option value="all" ${productFilters.status === 'all' ? 'selected' : ''}>全部状态</option>
          <option value="on" ${productFilters.status === 'on' ? 'selected' : ''}>在售</option>
          <option value="off" ${productFilters.status === 'off' ? 'selected' : ''}>已下架</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-product" type="button">${icon('plus', 16)} 新增商品</button>
      </div>

      ${
        data.items.length
          ? `<div class="table-wrap">
              <table class="admin-table">
                <thead><tr>
                  <th>商品</th><th>分类</th><th class="num">价格</th><th class="num">库存</th>
                  <th class="num">销量</th><th>状态</th><th>操作</th>
                </tr></thead>
                <tbody>
                  ${data.items
                    .map(
                      (product) => `<tr>
                        <td><div class="cell-product">
                          ${productThumb(product)}
                          <div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.subtitle || '—')}</span></div>
                        </div></td>
                        <td class="nowrap">${escapeHtml(product.categoryName || '—')}</td>
                        <td class="num">${money(product.price)}${product.originalPrice > product.price ? `<div class="muted" style="text-decoration:line-through">${money(product.originalPrice)}</div>` : ''}</td>
                        <td class="num"><span class="stock-value ${product.stock <= 0 ? 'zero' : product.stock <= 20 ? 'low' : ''}">${product.stock}</span></td>
                        <td class="num">${product.sales}</td>
                        <td>${product.status === 'on' ? '<span class="badge on">在售</span>' : '<span class="badge off">已下架</span>'}</td>
                        <td>
                          <div class="row-actions">
                            <button class="abtn" type="button" data-edit="${product.id}">编辑</button>
                            <button class="abtn" type="button" data-stock="${product.id}">库存</button>
                            <button class="abtn danger" type="button" data-del="${product.id}">删除</button>
                          </div>
                        </td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
            ${pagerHtml(data.page, data.pages, data.total)}`
          : emptyBlock('没有符合条件的商品', '调整筛选条件，或新增一个商品')
      }
    </div>
  `;

  const search = document.getElementById('product-search');
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      productFilters.keyword = search.value.trim();
      productFilters.page = 1;
      renderProducts();
    }
  });
  document.getElementById('filter-category').addEventListener('change', (event) => {
    productFilters.categoryId = event.target.value;
    productFilters.page = 1;
    renderProducts();
  });
  document.getElementById('filter-status').addEventListener('change', (event) => {
    productFilters.status = event.target.value;
    productFilters.page = 1;
    renderProducts();
  });
  document.getElementById('add-product').addEventListener('click', () => openProductModal(null));

  view.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = data.items.find((item) => String(item.id) === button.dataset.edit);
      openProductModal(product);
    });
  });
  view.querySelectorAll('[data-stock]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = data.items.find((item) => String(item.id) === button.dataset.stock);
      openStockModal(product);
    });
  });
  view.querySelectorAll('[data-del]').forEach((button) => {
    button.addEventListener('click', () => {
      const product = data.items.find((item) => String(item.id) === button.dataset.del);
      deleteProduct(product);
    });
  });

  bindPager(view, (page) => {
    productFilters.page = page;
    renderProducts();
  });
}

function openProductModal(product) {
  const editing = !!product;
  const body = `
    <form class="form-grid" id="product-form" autocomplete="off">
      <div class="field full"><label>商品名称 <em>*</em></label>
        <input class="input" name="name" maxlength="80" value="${editing ? escapeHtml(product.name) : ''}" placeholder="例如：华硕 TUF RTX 5080 OC 16G">
      </div>
      <div class="field full"><label>副标题 / 核心卖点</label>
        <input class="input" name="subtitle" maxlength="120" value="${editing ? escapeHtml(product.subtitle || '') : ''}" placeholder="例如：三风扇 · 军规用料 · 16G GDDR7">
      </div>
      <div class="field"><label>所属分类 <em>*</em></label>
        <select class="select" name="categoryId">
          ${state.categories
            .map(
              (category) =>
                `<option value="${category.id}" ${editing && product.categoryId === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`
            )
            .join('')}
        </select>
      </div>
      <div class="field"><label>状态</label>
        <select class="select" name="status">
          <option value="on" ${!editing || product.status === 'on' ? 'selected' : ''}>在售</option>
          <option value="off" ${editing && product.status === 'off' ? 'selected' : ''}>下架</option>
        </select>
      </div>
      <div class="field"><label>售价（元） <em>*</em></label>
        <input class="input" name="price" type="number" min="0.01" step="0.01" value="${editing ? (product.price / 100).toFixed(2) : ''}" placeholder="0.00">
      </div>
      <div class="field"><label>划线价（元）</label>
        <input class="input" name="originalPrice" type="number" min="0" step="0.01" value="${editing ? (product.originalPrice / 100).toFixed(2) : ''}" placeholder="0.00">
      </div>
      <div class="field"><label>库存数量 <em>*</em></label>
        <input class="input" name="stock" type="number" min="0" step="1" value="${editing ? product.stock : 100}">
      </div>
      <div class="field"><label>角标</label>
        <select class="select" name="badge">
          ${['', '热卖', '新品', '精选']
            .map((value) => `<option value="${value}" ${editing && product.badge === value ? 'selected' : ''}>${value || '无'}</option>`)
            .join('')}
        </select>
      </div>
      <div class="field full"><label>商品主图 URL</label>
        <input class="input" name="image" value="${editing ? escapeHtml(product.image || '') : ''}" placeholder="https://... 留空则显示占位底色">
      </div>
      <div class="field full">
        <div class="image-preview" id="image-preview">${editing && product.image ? '预览加载中…' : '暂无主图'}</div>
      </div>
      <div class="field full"><label>商品描述</label>
        <textarea class="textarea" name="description" maxlength="2000" placeholder="介绍商品的材质、功能与使用场景">${editing ? escapeHtml(product.description || '') : ''}</textarea>
      </div>
    </form>
  `;

  const modal = openModal({
    title: editing ? '编辑商品' : '新增商品',
    size: 720,
    body,
    footer: `
      <button class="btn btn-soft" type="button" data-act="cancel">取消</button>
      <button class="btn btn-primary" type="button" data-act="save">${editing ? '保存修改' : '创建商品'}</button>
    `,
  });

  const form = modal.el.querySelector('#product-form');
  const preview = modal.el.querySelector('#image-preview');
  const imageInput = form.elements.image;

  const paintPreview = () => {
    const url = imageInput.value.trim();
    if (!url) {
      preview.innerHTML = '暂无主图';
      return;
    }
    preview.innerHTML = `<img src="${escapeHtml(url)}" alt="预览" onerror="this.parentNode.textContent='图片地址无法加载'">`;
  };
  paintPreview();
  imageInput.addEventListener('input', paintPreview);

  modal.el.querySelector('[data-act="cancel"]').addEventListener('click', modal.close);
  modal.el.querySelector('.modal-close').addEventListener('click', modal.close);

  modal.el.querySelector('[data-act="save"]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const payload = {
      name: form.elements.name.value.trim(),
      subtitle: form.elements.subtitle.value.trim(),
      categoryId: Number(form.elements.categoryId.value),
      status: form.elements.status.value,
      price: Math.round(Number(form.elements.price.value || 0) * 100),
      originalPrice: Math.round(Number(form.elements.originalPrice.value || 0) * 100),
      stock: Number.parseInt(form.elements.stock.value || '0', 10),
      badge: form.elements.badge.value,
      image: form.elements.image.value.trim(),
      description: form.elements.description.value.trim(),
    };

    if (payload.name.length < 2) return toast('请填写商品名称', 'error');
    if (!payload.price || payload.price <= 0) return toast('请填写正确的售价', 'error');
    if (Number.isNaN(payload.stock) || payload.stock < 0) return toast('库存不能为负数', 'error');

    button.disabled = true;
    button.textContent = '保存中…';
    try {
      await api(editing ? `/api/admin/products/${product.id}` : '/api/admin/products', {
        method: editing ? 'PUT' : 'POST',
        body: payload,
      });
      toast(editing ? '商品已更新' : '商品已创建');
      modal.close();
      renderProducts();
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
      button.textContent = editing ? '保存修改' : '创建商品';
    }
  });
}

function openStockModal(product) {
  if (!product) return;
  const modal = openModal({
    title: '调整库存',
    size: 420,
    body: `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        ${productThumb(product, 48)}
        <div>
          <strong style="font-size:13.5px">${escapeHtml(product.name)}</strong>
          <p class="muted" style="font-size:11.5px">当前库存 ${product.stock} 件 · 已售 ${product.sales} 件</p>
        </div>
      </div>
      <div class="field">
        <label>调整后的库存数量</label>
        <input class="input" id="stock-input" type="number" min="0" step="1" value="${product.stock}">
      </div>
      <div class="row-actions" style="margin-top:12px">
        <button class="abtn" type="button" data-quick="-10">−10</button>
        <button class="abtn" type="button" data-quick="-1">−1</button>
        <button class="abtn" type="button" data-quick="1">+1</button>
        <button class="abtn" type="button" data-quick="10">+10</button>
        <button class="abtn" type="button" data-quick="100">+100</button>
      </div>
    `,
    footer: `
      <button class="btn btn-soft" type="button" data-act="cancel">取消</button>
      <button class="btn btn-primary" type="button" data-act="save">保存库存</button>
    `,
  });

  const input = modal.el.querySelector('#stock-input');
  modal.el.querySelectorAll('[data-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = String(Math.max(0, Number(input.value || 0) + Number(button.dataset.quick)));
    });
  });
  modal.el.querySelector('[data-act="cancel"]').addEventListener('click', modal.close);
  modal.el.querySelector('.modal-close').addEventListener('click', modal.close);

  modal.el.querySelector('[data-act="save"]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const stock = Number.parseInt(input.value || '0', 10);
    if (Number.isNaN(stock) || stock < 0) return toast('请输入正确的库存数量', 'error');
    button.disabled = true;
    try {
      await api(`/api/admin/products/${product.id}/stock`, { method: 'PATCH', body: { stock } });
      toast('库存已更新');
      modal.close();
      renderProducts();
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });
}

async function deleteProduct(product) {
  if (!product) return;
  const ok = await confirmDialog({
    title: '删除商品',
    message: `确定删除「${escapeHtml(product.name)}」吗？若该商品已产生历史订单，将自动改为下架处理以保留订单快照。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    const result = await api(`/api/admin/products/${product.id}`, { method: 'DELETE' });
    toast(result.archived ? result.message : '商品已删除');
    renderProducts();
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* ------------------------------------------------------------------ */
/* 分类管理                                                            */
/* ------------------------------------------------------------------ */

async function renderCategories() {
  setPage('分类管理', '组织商品分类，前台导航会同步展示');
  const view = viewEl();
  view.innerHTML = loadingBlock();
  await loadCategories();
  const categories = state.categories;

  view.innerHTML = `
    <div class="filter-bar">
      <span class="result-meta" style="font-size:12px;color:var(--muted)">共 ${categories.length} 个分类</span>
      <div class="spacer"></div>
      <button class="btn btn-primary" id="add-category" type="button">${icon('plus', 16)} 新增分类</button>
    </div>
    ${
      categories.length
        ? `<div class="category-grid">
            ${categories
              .map(
                (category) => `<div class="category-card">
                  <div class="cc-head">
                    <span class="cc-icon">${icon(category.icon, 20)}</span>
                    <div><h3>${escapeHtml(category.name)}</h3><span class="cc-count">${category.productCount} 件商品</span></div>
                  </div>
                  <p class="cc-desc">${escapeHtml(category.description || '暂无描述')}</p>
                  <div class="cc-foot">
                    <span class="cc-count">排序 ${category.sortOrder}</span>
                    <div class="row-actions">
                      <button class="abtn" type="button" data-edit-cat="${category.id}">编辑</button>
                      <button class="abtn danger" type="button" data-del-cat="${category.id}">删除</button>
                    </div>
                  </div>
                </div>`
              )
              .join('')}
          </div>`
        : `<div class="card">${emptyBlock('还没有分类', '新增第一个分类后，就可以给商品归类了')}</div>`
    }
  `;

  document.getElementById('add-category').addEventListener('click', () => openCategoryModal(null));
  view.querySelectorAll('[data-edit-cat]').forEach((button) => {
    button.addEventListener('click', () => {
      const category = categories.find((item) => String(item.id) === button.dataset.editCat);
      openCategoryModal(category);
    });
  });
  view.querySelectorAll('[data-del-cat]').forEach((button) => {
    button.addEventListener('click', async () => {
      const category = categories.find((item) => String(item.id) === button.dataset.delCat);
      if (!category) return;
      const ok = await confirmDialog({
        title: '删除分类',
        message: `确定删除分类「${escapeHtml(category.name)}」吗？分类下若仍有商品将无法删除。`,
        confirmText: '删除',
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/admin/categories/${category.id}`, { method: 'DELETE' });
        toast('分类已删除');
        renderCategories();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}

function openCategoryModal(category) {
  const editing = !!category;
  const modal = openModal({
    title: editing ? '编辑分类' : '新增分类',
    size: 460,
    body: `
      <form class="form-grid" id="category-form">
        <div class="field full"><label>分类名称 <em>*</em></label>
          <input class="input" name="name" maxlength="30" value="${editing ? escapeHtml(category.name) : ''}" placeholder="例如：显卡">
        </div>
        <div class="field"><label>图标</label>
          <select class="select" name="icon">
            ${CATEGORY_ICONS.map(
              ([value, label]) => `<option value="${value}" ${editing && category.icon === value ? 'selected' : ''}>${label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field"><label>排序（越小越靠前）</label>
          <input class="input" name="sortOrder" type="number" step="1" value="${editing ? category.sortOrder : state.categories.length}">
        </div>
        <div class="field full"><label>分类描述</label>
          <input class="input" name="description" maxlength="60" value="${editing ? escapeHtml(category.description || '') : ''}" placeholder="一句话介绍这个分类">
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-soft" type="button" data-act="cancel">取消</button>
      <button class="btn btn-primary" type="button" data-act="save">${editing ? '保存修改' : '创建分类'}</button>
    `,
  });

  const form = modal.el.querySelector('#category-form');
  modal.el.querySelector('[data-act="cancel"]').addEventListener('click', modal.close);
  modal.el.querySelector('.modal-close').addEventListener('click', modal.close);

  modal.el.querySelector('[data-act="save"]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const payload = {
      name: form.elements.name.value.trim(),
      icon: form.elements.icon.value,
      sortOrder: Number.parseInt(form.elements.sortOrder.value || '0', 10),
      description: form.elements.description.value.trim(),
    };
    if (payload.name.length < 2) return toast('请填写分类名称', 'error');
    button.disabled = true;
    try {
      await api(editing ? `/api/admin/categories/${category.id}` : '/api/admin/categories', {
        method: editing ? 'PUT' : 'POST',
        body: payload,
      });
      toast(editing ? '分类已更新' : '分类已创建');
      modal.close();
      renderCategories();
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* 订单管理                                                            */
/* ------------------------------------------------------------------ */

async function renderOrders() {
  setPage('订单管理', '处理发货、取消与订单状态流转');
  const view = viewEl();
  view.innerHTML = loadingBlock();

  const query = new URLSearchParams({ page: String(orderFilters.page), pageSize: '10', status: orderFilters.status });
  if (orderFilters.keyword) query.set('keyword', orderFilters.keyword);
  const data = await api(`/api/admin/orders?${query.toString()}`);

  const tabs = [
    ['all', '全部'],
    ['pending', '待付款'],
    ['paid', '待发货'],
    ['shipped', '待收货'],
    ['completed', '已完成'],
    ['cancelled', '已取消'],
  ];
  const totalAll = Object.values(data.counts).reduce((sum, n) => sum + n, 0);

  view.innerHTML = `
    <div class="tabs-row">
      ${tabs
        .map(
          ([value, label]) => `<button class="tab ${orderFilters.status === value ? 'active' : ''}" type="button" data-status="${value}">
            ${label}<span class="count">${value === 'all' ? totalAll : data.counts[value] || 0}</span>
          </button>`
        )
        .join('')}
    </div>
    <div class="card">
      <div class="filter-bar">
        <div class="search-field">
          ${icon('search', 15)}
          <input class="input" id="order-search" placeholder="搜索订单号 / 收货人 / 用户名，回车确认" value="${escapeHtml(orderFilters.keyword)}">
        </div>
        <div class="spacer"></div>
        <span class="result-meta" style="font-size:12px;color:var(--muted)">共 ${data.total} 笔订单</span>
      </div>

      ${
        data.items.length
          ? `<div class="table-wrap">
              <table class="admin-table">
                <thead><tr>
                  <th>订单号</th><th>用户</th><th>商品</th><th class="num">金额</th>
                  <th>状态</th><th>下单时间</th><th>操作</th>
                </tr></thead>
                <tbody>
                  ${data.items
                    .map((order) => {
                      const actions = [`<button class="abtn" type="button" data-view="${order.id}">详情</button>`];
                      if (order.status === 'paid') actions.push(`<button class="abtn primary" type="button" data-ship="${order.id}">发货</button>`);
                      if (order.status === 'shipped') actions.push(`<button class="abtn primary" type="button" data-complete="${order.id}">完成</button>`);
                      if (['pending', 'paid'].includes(order.status)) actions.push(`<button class="abtn danger" type="button" data-cancel="${order.id}">取消</button>`);
                      return `<tr>
                        <td class="nowrap"><strong>${escapeHtml(order.orderNo)}</strong></td>
                        <td>${escapeHtml(order.username || '—')}<div class="muted">${escapeHtml(order.receiverName)}</div></td>
                        <td><span class="muted">${escapeHtml(order.items[0] ? order.items[0].name : '—')}${order.items.length > 1 ? ` 等 ${order.itemCount} 件` : ''}</span></td>
                        <td class="num"><strong>${money(order.total)}</strong></td>
                        <td>${statusBadge(order.status)}</td>
                        <td class="nowrap muted">${formatDateTime(order.createdAt)}</td>
                        <td><div class="row-actions">${actions.join('')}</div></td>
                      </tr>`;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
            ${pagerHtml(data.page, data.pages, data.total)}`
          : emptyBlock('没有符合条件的订单', '切换状态或调整搜索关键词')
      }
    </div>
  `;

  const search = document.getElementById('order-search');
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      orderFilters.keyword = search.value.trim();
      orderFilters.page = 1;
      renderOrders();
    }
  });
  view.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      orderFilters.status = button.dataset.status;
      orderFilters.page = 1;
      renderOrders();
    });
  });
  view.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => openOrderModal(Number(button.dataset.view)));
  });
  view.querySelectorAll('[data-ship]').forEach((button) => {
    button.addEventListener('click', () => changeOrderStatus(Number(button.dataset.ship), 'shipped'));
  });
  view.querySelectorAll('[data-complete]').forEach((button) => {
    button.addEventListener('click', () => changeOrderStatus(Number(button.dataset.complete), 'completed'));
  });
  view.querySelectorAll('[data-cancel]').forEach((button) => {
    button.addEventListener('click', () => changeOrderStatus(Number(button.dataset.cancel), 'cancelled'));
  });
  bindPager(view, (page) => {
    orderFilters.page = page;
    renderOrders();
  });
}

async function changeOrderStatus(id, status) {
  if (status === 'cancelled') {
    const ok = await confirmDialog({
      title: '取消订单',
      message: '取消后会自动把库存释放回商品，已支付订单还会生成退款流水。确认继续吗？',
      confirmText: '确认取消',
      danger: true,
    });
    if (!ok) return;
  }
  const label = { shipped: '发货', completed: '完成', cancelled: '取消' }[status] || '更新';
  try {
    await api(`/api/admin/orders/${id}/status`, { method: 'PATCH', body: { status } });
    toast(`订单已${label}`);
    router();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function openOrderModal(id) {
  let order;
  try {
    order = await api(`/api/admin/orders/${id}`);
  } catch (error) {
    toast(error.message, 'error');
    return;
  }
  const steps = [
    ['提交订单', order.createdAt],
    ['付款成功', order.paidAt],
    ['商品出库', order.shippedAt],
    ['交易完成', order.completedAt],
  ];
  const actions = ['<button class="btn btn-soft" type="button" data-act="close">关闭</button>'];
  if (order.status === 'paid') actions.push('<button class="btn btn-primary" type="button" data-act="ship">确认发货</button>');
  if (order.status === 'shipped') actions.push('<button class="btn btn-primary" type="button" data-act="complete">标记完成</button>');
  if (['pending', 'paid'].includes(order.status)) actions.push('<button class="btn btn-accent" type="button" data-act="cancel">取消订单</button>');

  const modal = openModal({
    title: `订单详情`,
    size: 720,
    body: `
      <div class="order-detail-head">
        <div>
          <span class="order-no">${escapeHtml(order.orderNo)}</span>
          <div class="muted" style="font-size:11.5px;margin-top:2px">下单于 ${formatDateTime(order.createdAt, true)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          ${statusBadge(order.status)}
          <span class="muted" style="font-size:11.5px">用户 ${escapeHtml(order.username || '—')} · #${order.userId}</span>
        </div>
      </div>
      <div class="timeline-mini">
        ${steps
          .map(
            ([label, time]) =>
              `<div class="${time ? 'done' : ''}">${label}${time ? `<br>${formatDateTime(time)}` : ''}</div>`
          )
          .join('')}
        ${order.cancelledAt ? `<div class="done" style="background:#f1efec;color:var(--muted)">已取消<br>${formatDateTime(order.cancelledAt)}</div>` : ''}
      </div>
      <div class="detail-grid-2">
        <div class="info-box">
          <h4>收货信息</h4>
          <b>${escapeHtml(order.receiverName)}</b> · ${escapeHtml(order.phone)}<br>
          ${escapeHtml(order.address)}
          ${order.remark ? `<br>备注：${escapeHtml(order.remark)}` : ''}
        </div>
        <div class="info-box">
          <h4>支付信息</h4>
          ${
            order.payments.length
              ? order.payments
                  .map(
                    (payment) =>
                      `${payMethodLabel[payment.method] || payment.method} · ${money(payment.amount)} · ${
                        payment.status === 'success' ? '支付成功' : payment.status === 'refunded' ? '已退款' : '退款流水'
                      }<br><span style="font-size:10.5px">${escapeHtml(payment.transactionNo)}</span>`
                  )
                  .join('<br>')
              : '尚未支付'
          }
        </div>
      </div>
      <div class="detail-items">
        ${order.items
          .map(
            (item) => `<div class="detail-item">
              ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" onerror="this.style.display='none'">` : '<span class="ph" style="width:40px;height:40px;border-radius:8px;background:var(--cream)"></span>'}
              <div class="di-name">${escapeHtml(item.name)}<span>${money(item.price)} × ${item.quantity}</span></div>
              <strong>${money(item.subtotal)}</strong>
            </div>`
          )
          .join('')}
      </div>
      <div class="detail-total"><span>订单总额（${order.itemCount} 件商品）</span><strong>${money(order.total)}</strong></div>
    `,
    footer: actions.join(''),
  });

  modal.el.querySelector('[data-act="close"]').addEventListener('click', modal.close);
  modal.el.querySelector('.modal-close').addEventListener('click', modal.close);
  const bindAction = (act, status) => {
    const button = modal.el.querySelector(`[data-act="${act}"]`);
    if (!button) return;
    button.addEventListener('click', async () => {
      if (status === 'cancelled') {
        modal.close();
        return changeOrderStatus(order.id, 'cancelled');
      }
      try {
        await api(`/api/admin/orders/${order.id}/status`, { method: 'PATCH', body: { status } });
        toast(status === 'shipped' ? '订单已发货' : '订单已完成');
        modal.close();
        router();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  };
  bindAction('ship', 'shipped');
  bindAction('complete', 'completed');
  bindAction('cancel', 'cancelled');
}

/* ------------------------------------------------------------------ */
/* 用户管理                                                            */
/* ------------------------------------------------------------------ */

async function renderUsers() {
  setPage('用户管理', '查看注册用户、消费情况与账号状态');
  const view = viewEl();
  view.innerHTML = loadingBlock();
  const query = new URLSearchParams();
  if (userFilters.keyword) query.set('keyword', userFilters.keyword);
  const users = await api(`/api/admin/users?${query.toString()}`);

  view.innerHTML = `
    <div class="card">
      <div class="filter-bar">
        <div class="search-field">
          ${icon('search', 15)}
          <input class="input" id="user-search" placeholder="搜索用户名 / 邮箱，回车确认" value="${escapeHtml(userFilters.keyword)}">
        </div>
        <div class="spacer"></div>
        <span class="result-meta" style="font-size:12px;color:var(--muted)">共 ${users.length} 位用户</span>
      </div>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>用户</th><th>角色</th><th>状态</th><th class="num">订单数</th>
            <th class="num">累计消费</th><th>注册时间</th><th>最近下单</th><th>操作</th>
          </tr></thead>
          <tbody>
            ${users
              .map((user) => {
                const self = user.id === state.user.id;
                return `<tr>
                  <td>
                    <div class="cell-product">
                      <span class="ph" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--muted)">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</span>
                      <div><strong>${escapeHtml(user.username)}${self ? ' <span class="badge info">当前登录</span>' : ''}</strong><span>${escapeHtml(user.email)}</span></div>
                    </div>
                  </td>
                  <td>
                    <select class="select" style="height:30px;width:auto;font-size:11.5px;border-radius:8px" data-role-user="${user.id}" ${self ? 'disabled' : ''}>
                      <option value="user" ${user.role === 'user' ? 'selected' : ''}>普通用户</option>
                      <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
                    </select>
                  </td>
                  <td>${user.status === 'active' ? '<span class="badge on">正常</span>' : '<span class="badge danger">已停用</span>'}</td>
                  <td class="num">${user.orderCount}</td>
                  <td class="num">${money(user.totalSpent)}</td>
                  <td class="nowrap muted">${formatDateTime(user.createdAt)}</td>
                  <td class="nowrap muted">${user.lastOrderAt ? formatDateTime(user.lastOrderAt) : '—'}</td>
                  <td>
                    <button class="abtn ${user.status === 'active' ? 'danger' : 'primary'}" type="button" data-toggle-user="${user.id}" ${self ? 'disabled' : ''}>
                      ${user.status === 'active' ? '停用账号' : '启用账号'}
                    </button>
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const search = document.getElementById('user-search');
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      userFilters.keyword = search.value.trim();
      renderUsers();
    }
  });

  view.querySelectorAll('[data-role-user]').forEach((select) => {
    select.addEventListener('change', async () => {
      const user = users.find((item) => String(item.id) === select.dataset.roleUser);
      const nextRole = select.value;
      const ok = await confirmDialog({
        title: '修改用户角色',
        message: `确定将「${escapeHtml(user.username)}」设置为${nextRole === 'admin' ? '管理员' : '普通用户'}吗？`,
        confirmText: '确认修改',
      });
      if (!ok) {
        select.value = user.role;
        return;
      }
      try {
        await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { role: nextRole } });
        toast('角色已更新');
        renderUsers();
      } catch (error) {
        toast(error.message, 'error');
        select.value = user.role;
      }
    });
  });

  view.querySelectorAll('[data-toggle-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      const user = users.find((item) => String(item.id) === button.dataset.toggleUser);
      const disabling = user.status === 'active';
      const ok = await confirmDialog({
        title: disabling ? '停用账号' : '启用账号',
        message: disabling
          ? `停用后「${escapeHtml(user.username)}」将无法登录和下单，确认继续吗？`
          : `确认恢复「${escapeHtml(user.username)}」的账号使用权限吗？`,
        confirmText: disabling ? '停用' : '启用',
        danger: disabling,
      });
      if (!ok) return;
      try {
        await api(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          body: { status: disabling ? 'disabled' : 'active' },
        });
        toast(disabling ? '账号已停用' : '账号已启用');
        renderUsers();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* 库存管理                                                            */
/* ------------------------------------------------------------------ */

async function renderInventory() {
  setPage('库存管理', '监控库存水位，及时补货');
  const view = viewEl();
  view.innerHTML = loadingBlock();
  const all = await api('/api/admin/inventory');
  const keyword = inventoryFilters.keyword.trim().toLowerCase();
  const items = all.filter((item) => {
    if (inventoryFilters.low && item.stock > 20) return false;
    if (keyword && !item.name.toLowerCase().includes(keyword)) return false;
    return true;
  });

  const totalStock = all.reduce((sum, item) => sum + item.stock, 0);
  const lowCount = all.filter((item) => item.stock <= 20).length;
  const outCount = all.filter((item) => item.stock === 0).length;
  const onSaleCount = all.filter((item) => item.status === 'on').length;

  view.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><span class="k-label">${icon('archive', 14)} 在售商品</span><span class="k-value">${onSaleCount}</span><span class="k-foot">共 ${all.length} 件商品</span></div>
      <div class="kpi"><span class="k-label">${icon('package', 14)} 总库存</span><span class="k-value">${totalStock}</span><span class="k-foot">所有商品库存合计</span></div>
      <div class="kpi warn"><span class="k-label">${icon('alert', 14)} 库存偏低</span><span class="k-value">${lowCount}</span><span class="k-foot">库存 ≤ 20 件</span></div>
      <div class="kpi danger"><span class="k-label">${icon('alert', 14)} 已缺货</span><span class="k-value">${outCount}</span><span class="k-foot">需要尽快补货</span></div>
    </div>

    <div class="card">
      <div class="filter-bar">
        <div class="search-field">
          ${icon('search', 15)}
          <input class="input" id="inventory-search" placeholder="搜索商品名称，回车确认" value="${escapeHtml(inventoryFilters.keyword)}">
        </div>
        <button class="abtn ${inventoryFilters.low ? 'primary' : ''}" type="button" id="toggle-low">仅看低库存</button>
        <div class="spacer"></div>
        <span class="result-meta" style="font-size:12px;color:var(--muted)">显示 ${items.length} 件</span>
      </div>
      ${
        items.length
          ? `<div class="table-wrap">
              <table class="admin-table">
                <thead><tr><th>商品</th><th>分类</th><th>状态</th><th class="num">已售</th><th class="num">当前库存</th><th>库存调整</th></tr></thead>
                <tbody>
                  ${items
                    .map(
                      (item) => `<tr>
                        <td><div class="cell-product">
                          ${productThumb(item)}
                          <div><strong>${escapeHtml(item.name)}</strong><span>${money(item.price)}</span></div>
                        </div></td>
                        <td class="nowrap">${escapeHtml(item.categoryName || '—')}</td>
                        <td>${item.status === 'on' ? '<span class="badge on">在售</span>' : '<span class="badge off">已下架</span>'}</td>
                        <td class="num">${item.sales}</td>
                        <td class="num"><span class="stock-value ${item.stock === 0 ? 'zero' : item.stock <= 20 ? 'low' : ''}">${item.stock}</span></td>
                        <td>
                          <div class="stock-editor">
                            <button class="abtn" type="button" data-delta="-10" data-id="${item.id}">−10</button>
                            <input type="number" min="0" value="${item.stock}" data-stock-input="${item.id}">
                            <button class="abtn" type="button" data-delta="10" data-id="${item.id}">+10</button>
                            <button class="abtn primary" type="button" data-save-stock="${item.id}">保存</button>
                          </div>
                        </td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : emptyBlock('没有符合条件的商品', '调整搜索或关闭低库存筛选')
      }
    </div>
  `;

  const search = document.getElementById('inventory-search');
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      inventoryFilters.keyword = search.value.trim();
      renderInventory();
    }
  });
  document.getElementById('toggle-low').addEventListener('click', () => {
    inventoryFilters.low = !inventoryFilters.low;
    renderInventory();
  });

  view.querySelectorAll('[data-delta]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = view.querySelector(`[data-stock-input="${button.dataset.id}"]`);
      if (!input) return;
      input.value = String(Math.max(0, Number(input.value || 0) + Number(button.dataset.delta)));
    });
  });

  view.querySelectorAll('[data-save-stock]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.saveStock;
      const input = view.querySelector(`[data-stock-input="${id}"]`);
      const stock = Number.parseInt(input.value || '0', 10);
      if (Number.isNaN(stock) || stock < 0) return toast('请输入正确的库存数量', 'error');
      button.disabled = true;
      try {
        await api(`/api/admin/products/${id}/stock`, { method: 'PATCH', body: { stock } });
        toast('库存已更新');
        renderInventory();
      } catch (error) {
        toast(error.message, 'error');
        button.disabled = false;
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* 销售统计                                                            */
/* ------------------------------------------------------------------ */

async function renderSales() {
  setPage('销售统计', '按时间维度分析销售额、品类与订单结构');
  const view = viewEl();
  view.innerHTML = loadingBlock();
  const data = await api(`/api/admin/sales?days=${salesRange.days}`);

  view.innerHTML = `
    <div class="filter-bar">
      <div class="seg">
        ${[7, 30, 90]
          .map(
            (days) =>
              `<button type="button" data-days="${days}" class="${salesRange.days === days ? 'active' : ''}">近 ${days} 天</button>`
          )
          .join('')}
      </div>
      <span class="result-meta" style="font-size:12px;color:var(--muted)">统计区间：${data.start} 至 今天</span>
    </div>

    <div class="kpi-grid">
      <div class="kpi dark"><span class="k-label">${icon('wallet', 14)} 销售额</span><span class="k-value">${money(data.summary.revenue)}</span><span class="k-foot">已支付订单合计</span></div>
      <div class="kpi"><span class="k-label">${icon('inbox', 14)} 订单数</span><span class="k-value">${data.summary.orders}</span><span class="k-foot">含待发货与已完成</span></div>
      <div class="kpi"><span class="k-label">${icon('chart', 14)} 客单价</span><span class="k-value">${money(data.summary.averageOrder)}</span><span class="k-foot">销售额 ÷ 订单数</span></div>
      <div class="kpi"><span class="k-label">${icon('package', 14)} 售出件数</span><span class="k-value">${data.summary.items}</span><span class="k-foot">订单内商品数量合计</span></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>销售额走势</h3><span class="meta">近 ${data.days} 天已支付订单</span></div>
      ${areaChart(data.trend)}
    </div>

    <div class="dash-grid" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h3>分类销售占比</h3><span class="meta">按销售额</span></div>
        ${
          data.byCategory.length
            ? `<div class="share-list">${data.byCategory
                .map((item) => {
                  const totalRevenue = data.byCategory.reduce((sum, row) => sum + row.revenue, 0) || 1;
                  const percent = ((item.revenue / totalRevenue) * 100).toFixed(1);
                  return `<div class="share-item">
                    <div class="sh-head"><strong>${escapeHtml(item.name)}</strong><span>${money(item.revenue)} · ${percent}%</span></div>
                    <div class="sh-track"><div class="sh-bar" style="width:${percent}%"></div></div>
                  </div>`;
                })
                .join('')}</div>`
            : '<p class="muted" style="font-size:12px">该区间暂无销售数据</p>'
        }
      </div>
      <div class="card">
        <div class="card-head"><h3>订单状态结构</h3><span class="meta">区间内订单</span></div>
        ${statusDistribution(data.statusCounts)}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>商品销售排行</h3><span class="meta">按销售额 TOP 8</span></div>
      ${
        data.topProducts.length
          ? `<div class="table-wrap">
              <table class="admin-table">
                <thead><tr><th>排名</th><th>商品</th><th class="num">售出件数</th><th class="num">销售额</th></tr></thead>
                <tbody>${data.topProducts
                  .map(
                    (item, index) => `<tr>
                      <td><span class="rk ${index < 3 ? 'top' : ''}" style="font-weight:700;color:${index < 3 ? 'var(--accent)' : 'var(--muted-2)'}">${String(index + 1).padStart(2, '0')}</span></td>
                      <td><div class="cell-product">
                        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="" onerror="this.style.display='none'">` : '<span class="ph"></span>'}
                        <div><strong>${escapeHtml(item.name)}</strong></div>
                      </div></td>
                      <td class="num">${item.quantity}</td>
                      <td class="num"><strong>${money(item.revenue)}</strong></td>
                    </tr>`
                  )
                  .join('')}</tbody>
              </table>
            </div>`
          : emptyBlock('暂无销售数据', '有订单支付后即可查看商品排行')
      }
    </div>
  `;

  view.querySelectorAll('[data-days]').forEach((button) => {
    button.addEventListener('click', () => {
      salesRange.days = Number(button.dataset.days);
      renderSales();
    });
  });
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    state.user = await api('/api/auth/me');
  } catch {
    state.user = null;
  }
  if (!state.user || state.user.role !== 'admin') {
    renderAuth();
    return;
  }
  try {
    await startApp();
  } catch (error) {
    renderAuth(error.message);
  }
});
