/* 共享 UI 工具：图标、金额格式化、请求封装、Toast、弹窗 */

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>',
  cart: '<path d="M6 7h12l1.2 13H4.8z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.7l5.8-.8z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/>',
  truck: '<path d="M3 6h11v11H3z"/><path d="M14 9h4l3 3v5h-7"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  refresh: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16"/><path d="M4 20v-4h4"/>',
  arrowRight: '<path d="M4 12h15M14 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z"/>',
  logout: '<path d="M15 5H6v14h9"/><path d="M12 12h9M18 9l3 3-3 3"/>',
  package: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V7M16 16v-8"/>',
  tag: '<path d="M3 12l9-9h9v9l-9 9z"/><circle cx="16" cy="8" r="1.4"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6"/><path d="M17 14.8c2.4.5 4 2.3 4 4.7"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v11h14V9"/><path d="M10 13h4"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  phone: '<path d="M6 3h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
  pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  digital: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  pc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6"/><circle cx="9" cy="16.5" r="1.2"/>',
  cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  gpu: '<rect x="2.5" y="7" width="19" height="10" rx="2"/><circle cx="8" cy="12" r="2.4"/><circle cx="15" cy="12" r="2.4"/><path d="M6 17v3M18 17v3"/>',
  mb: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="5" height="5" rx="1"/><path d="M16 7v5M7 16h10"/>',
  ram: '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6 16v3M10 16v3M14 16v3M18 16v3"/>',
  ssd: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h8M8 12h5"/><circle cx="16.5" cy="16" r="1.2"/>',
  cooling: '<circle cx="12" cy="12" r="9"/><path d="M12 12c1.6-1.4 4-1.8 4.9-.4s-.4 3.6-2.4 3.8S12 12 12 12z"/><path d="M12 12c-1.6-1.4-4-1.8-4.9-.4s.4 3.6 2.4 3.8S12 12 12 12z"/><circle cx="12" cy="12" r="1.2"/>',
  case: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M9 6.5h6"/><circle cx="12" cy="12" r="3"/><path d="M9 18.5h6"/>',
  psu: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="9" cy="12" r="3"/><path d="M15 10h3M15 14h3"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6"/>',
  fashion: '<path d="M8 8V6a4 4 0 0 1 8 0v2"/><path d="M5 8h14l1 13H4z"/>',
  beauty: '<path d="M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10z"/>',
  food: '<path d="M5 8h11v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 4v2M11 4v2"/>',
  sport: '<path d="M3 18l6-9 4 6 3-4 5 7z"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 20a3 3 0 0 1-3-3V4"/>',
  pet: '<circle cx="8" cy="7" r="2"/><circle cx="16" cy="7" r="2"/><circle cx="5" cy="13" r="2"/><circle cx="19" cy="13" r="2"/><path d="M12 20c-2.8 0-5-1.8-5-4 0-1.4 1-2.5 2.5-2.5 1 0 1.8.5 2.5 1.2.7-.7 1.5-1.2 2.5-1.2 1.5 0 2.5 1.1 2.5 2.5 0 2.2-2.2 4-5 4z"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/>',
  wechat: '<path d="M9 4c-4 0-7 2.4-7 5.4 0 1.7 1 3.3 2.7 4.3L4 16l2.5-1.4c.8.2 1.6.3 2.5.3"/><path d="M22 14.5c0-2.5-2.4-4.5-5.4-4.5s-5.4 2-5.4 4.5 2.4 4.5 5.4 4.5c.8 0 1.5-.1 2.2-.4L21 20l-.6-2.2c1-.8 1.6-2 1.6-3.3z"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>',
  wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z"/><path d="M4 7V5h12"/><circle cx="17" cy="14" r="1.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  inbox: '<path d="M3 13l2.5-8h13L21 13v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 16.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  bell: '<path d="M18 16H6l1.5-2.5V10a4.5 4.5 0 0 1 9 0v3.5z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
};

export function icon(name, size = 18, cls = '') {
  const body = ICONS[name] || ICONS.sparkles;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(cents) {
  const value = Number(cents || 0) / 100;
  if (Number.isInteger(value)) {
    return `¥${new Intl.NumberFormat('zh-CN').format(value)}`;
  }
  return `¥${moneyFormatter.format(value)}`;
}

export function yuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export function formatDateTime(value, withSeconds = false) {
  if (!value) return '—';
  const text = String(value);
  return withSeconds ? text : text.slice(0, 16);
}

export function formatDate(value) {
  return String(value || '').slice(0, 10);
}

export async function api(path, { method = 'GET', body, headers, ...rest } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    headers: { ...(headers || {}) },
    ...rest,
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || payload.ok === false) {
    const error = new Error((payload && payload.error) || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export const ORDER_STATUS = {
  pending: { label: '待付款', cls: 'status-pending' },
  paid: { label: '待发货', cls: 'status-paid' },
  shipped: { label: '待收货', cls: 'status-shipped' },
  completed: { label: '已完成', cls: 'status-completed' },
  cancelled: { label: '已取消', cls: 'status-cancelled' },
};

export const payMethodLabel = {
  alipay: '支付宝',
  wechat: '微信支付',
  card: '银行卡',
};

export function imageTag(src, alt, extra = '') {
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" ${extra} onerror="this.style.display='none'">`;
}

export function toast(message, type = 'success') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'checkCircle', 16)}<span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, 2400);
}

export function openModal({ title = '', body = '', footer = '', size = 460, className = '' }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal ${className}" style="max-width:${size}px" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${title}</h3>
        <button class="modal-close" type="button" aria-label="关闭">${icon('close', 16)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  return { overlay, close, el: overlay.querySelector('.modal') };
}

export function confirmDialog({
  title = '确认操作',
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const modal = openModal({
      title,
      body: `<p style="font-size:13.5px;color:var(--muted);line-height:1.8">${message}</p>`,
      footer: `
        <button class="btn btn-soft" data-act="cancel">${cancelText}</button>
        <button class="btn ${danger ? 'btn-accent' : 'btn-primary'}" data-act="ok">${confirmText}</button>
      `,
      size: 420,
    });
    modal.el.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      modal.close();
      resolve(false);
    });
    modal.el.querySelector('[data-act="ok"]').addEventListener('click', () => {
      modal.close();
      resolve(true);
    });
  });
}

export function stars(rating = 5, size = 13) {
  const full = Math.round(Number(rating) || 5);
  return `<span class="stars">${Array.from({ length: 5 }, (_, index) =>
    `<span style="opacity:${index < full ? 1 : 0.22}">${icon('star', size)}</span>`
  ).join('')}</span>`;
}
