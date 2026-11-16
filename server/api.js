import { db, nowStr } from './db.js';
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from './auth.js';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const routes = [];

function on(method, pattern, handler, options = {}) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/:[A-Za-z_]+/g, (token) => {
        keys.push(token.slice(1));
        return '([^/]+)';
      }) +
      '$'
  );
  routes.push({ method, regex, keys, handler, ...options });
}

function matchRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.regex);
    if (match) return { ...route, match };
  }
  return null;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function parseCookies(header = '') {
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  const data = verifyToken(token);
  if (!data) return null;
  const user = db
    .prepare('SELECT id, username, email, role, status, created_at FROM users WHERE id = ?')
    .get(data.uid);
  if (!user || user.status !== 'active') return null;
  return user;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new ApiError(413, '请求内容过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ApiError(400, '请求数据格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function setSessionCookie(res, user) {
  const token = createToken(user);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

const str = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const int = (value, fallback = 0) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (value) => value === true || value === 1 || value === '1' || value === 'true';

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
  };
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle,
    description: row.description,
    price: row.price_cents,
    originalPrice: row.original_price_cents,
    stock: row.stock,
    sales: row.sales,
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    categoryIcon: row.category_icon || null,
    image: row.image,
    badge: row.badge,
    rating: row.rating,
    reviews: row.reviews,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getCartRow(userId) {
  let cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(userId);
  if (!cart) {
    const timestamp = nowStr();
    const info = db.prepare('INSERT INTO carts (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(
      userId,
      timestamp,
      timestamp
    );
    cart = { id: Number(info.lastInsertRowid), user_id: userId };
  }
  return cart;
}

function cartPayload(userId) {
  const cart = getCartRow(userId);
  const rows = db
    .prepare(
      `SELECT ci.id, ci.quantity, ci.selected, ci.product_id,
              p.name, p.subtitle, p.image, p.price_cents, p.stock, p.status
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = ?
        ORDER BY ci.id DESC`
    )
    .all(cart.id);

  const items = rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    name: row.name,
    subtitle: row.subtitle,
    image: row.image,
    price: row.price_cents,
    stock: row.stock,
    status: row.status,
    available: row.status === 'on' && row.stock > 0,
    quantity: row.quantity,
    selected: !!row.selected,
    subtotal: row.price_cents * row.quantity,
  }));

  const selected = items.filter((item) => item.selected && item.available);
  return {
    id: cart.id,
    items,
    summary: {
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      selectedCount: selected.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: selected.reduce((sum, item) => sum + item.subtotal, 0),
      selectedItems: selected.length,
    },
  };
}

function mapOrder(row, items = [], payments = []) {
  return {
    id: row.id,
    orderNo: row.order_no,
    userId: row.user_id,
    username: row.username || null,
    total: row.total_cents,
    itemCount: row.item_count,
    status: row.status,
    receiverName: row.receiver_name,
    phone: row.phone,
    address: row.address,
    remark: row.remark,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      image: item.product_image,
      price: item.unit_price_cents,
      quantity: item.quantity,
      subtotal: item.subtotal_cents,
    })),
    payments: payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: payment.amount_cents,
      status: payment.status,
      transactionNo: payment.transaction_no,
      paidAt: payment.paid_at,
    })),
  };
}

function loadOrder(orderId, { includeUser = false } = {}) {
  const sql = includeUser
    ? `SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?`
    : 'SELECT o.* FROM orders o WHERE o.id = ?';
  const row = db.prepare(sql).get(orderId);
  if (!row) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId);
  const payments = db
    .prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC')
    .all(orderId);
  return mapOrder(row, items, payments);
}

function validateAddress(body) {
  const receiverName = str(body.receiverName, 30);
  const phone = str(body.phone, 20);
  const address = str(body.address, 200);
  const remark = str(body.remark, 200);
  if (receiverName.length < 2) throw new ApiError(400, '请填写收货人姓名');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new ApiError(400, '请填写正确的 11 位手机号');
  if (address.length < 5) throw new ApiError(400, '请填写详细收货地址');
  return { receiverName, phone, address, remark };
}

function makeOrderNo() {
  const base = nowStr().replace(/\D/g, '');
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return `NV${base}${suffix}`;
}

function restoreStock(orderId) {
  const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
  const update = db.prepare(
    'UPDATE products SET stock = stock + ?, sales = MAX(sales - ?, 0) WHERE id = ?'
  );
  items.forEach((item) => update.run(item.quantity, item.quantity, item.product_id));
}

/* ------------------------------------------------------------------ */
/* 认证                                                                */
/* ------------------------------------------------------------------ */

on('POST', '/api/auth/register', ({ body, res }) => {
  const username = str(body.username, 20);
  const email = str(body.email, 80).toLowerCase();
  const password = String(body.password ?? '');

  if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/.test(username)) {
    throw new ApiError(400, '用户名需为 3-20 位字母、数字、下划线或中文');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, '请输入正确的邮箱地址');
  if (password.length < 6) throw new ApiError(400, '密码至少 6 位');

  const exists = db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email);
  if (exists) throw new ApiError(409, '用户名或邮箱已被注册');

  const timestamp = nowStr();
  const info = db
    .prepare(
      'INSERT INTO users (username, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(username, email, hashPassword(password), 'user', 'active', timestamp);
  const userId = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO carts (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(
    userId,
    timestamp,
    timestamp
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  setSessionCookie(res, user);
  return publicUser(user);
});

on('POST', '/api/auth/login', ({ body, res }) => {
  const account = str(body.account, 80);
  const password = String(body.password ?? '');
  if (!account || !password) throw new ApiError(400, '请输入账号和密码');

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(account, account.toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new ApiError(401, '账号或密码不正确');
  }
  if (user.status !== 'active') throw new ApiError(403, '该账号已被停用，请联系管理员');

  setSessionCookie(res, user);
  return publicUser(user);
});

on('POST', '/api/auth/logout', ({ res }) => {
  clearSessionCookie(res);
  return { ok: true };
});

on('GET', '/api/auth/me', ({ user }) => (user ? publicUser(user) : null));

/* ------------------------------------------------------------------ */
/* 商品与分类（公开）                                                   */
/* ------------------------------------------------------------------ */

on('GET', '/api/categories', () => {
  const rows = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'on') AS product_count
         FROM categories c ORDER BY c.sort_order, c.id`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    description: row.description,
    sortOrder: row.sort_order,
    productCount: row.product_count,
  }));
});

on('GET', '/api/products', ({ query }) => {
  const keyword = str(query.get('keyword'), 50);
  const categoryId = int(query.get('categoryId'), 0);
  const sort = str(query.get('sort'), 20) || 'recommend';
  const page = Math.max(1, int(query.get('page'), 1));
  const pageSize = Math.min(48, Math.max(1, int(query.get('pageSize'), 12)));

  const where = ["p.status = 'on'"];
  const args = [];
  if (categoryId) {
    where.push('p.category_id = ?');
    args.push(categoryId);
  }
  if (keyword) {
    where.push('(p.name LIKE ? OR p.subtitle LIKE ? OR p.description LIKE ?)');
    const like = `%${keyword}%`;
    args.push(like, like, like);
  }

  const sortMap = {
    recommend: 'p.sales DESC, p.id DESC',
    sales: 'p.sales DESC',
    price_asc: 'p.price_cents ASC',
    price_desc: 'p.price_cents DESC',
    rating: 'p.rating DESC, p.reviews DESC',
    new: 'p.id DESC',
  };
  const orderBy = sortMap[sort] || sortMap.recommend;
  const whereSql = where.join(' AND ');

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${whereSql}`)
    .get(...args).n;
  const rows = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.icon AS category_icon
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${whereSql}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, (page - 1) * pageSize);

  return {
    items: rows.map(mapProduct),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
});

on('GET', '/api/products/:id', ({ params }) => {
  const row = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.icon AS category_icon
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?`
    )
    .get(int(params.id));
  if (!row || row.status !== 'on') throw new ApiError(404, '商品不存在或已下架');

  const related = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.icon AS category_icon
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.status = 'on' AND p.category_id = ? AND p.id <> ?
        ORDER BY p.sales DESC LIMIT 4`
    )
    .all(row.category_id, row.id);

  return { product: mapProduct(row), related: related.map(mapProduct) };
});

on('GET', '/api/home', () => {
  const categories = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'on') AS product_count
         FROM categories c ORDER BY c.sort_order, c.id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      productCount: row.product_count,
    }));

  const select = `SELECT p.*, c.name AS category_name, c.icon AS category_icon
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'on'`;

  const featured = db
    .prepare(`${select} AND p.badge <> '' ORDER BY p.sales DESC LIMIT 8`)
    .all()
    .map(mapProduct);
  const hot = db
    .prepare(`${select} ORDER BY p.sales DESC LIMIT 8`)
    .all()
    .map(mapProduct);
  const newest = db.prepare(`${select} ORDER BY p.id DESC LIMIT 4`).all().map(mapProduct);

  return { categories, featured, hot, newest };
});

/* ------------------------------------------------------------------ */
/* 购物车                                                              */
/* ------------------------------------------------------------------ */

on('GET', '/api/cart', ({ user }) => cartPayload(user.id), { auth: true });

on('POST', '/api/cart/items', ({ body, user }) => {
  const productId = int(body.productId);
  const quantity = Math.min(99, Math.max(1, int(body.quantity, 1)));
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product || product.status !== 'on') throw new ApiError(404, '商品不存在或已下架');
  if (product.stock <= 0) throw new ApiError(409, '该商品暂时缺货');

  const cart = getCartRow(user.id);
  const existing = db
    .prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?')
    .get(cart.id, productId);
  const timestamp = nowStr();

  if (existing) {
    const next = Math.min(product.stock, 99, existing.quantity + quantity);
    db.prepare('UPDATE cart_items SET quantity = ?, selected = 1 WHERE id = ?').run(next, existing.id);
  } else {
    db.prepare(
      'INSERT INTO cart_items (cart_id, product_id, quantity, selected, created_at) VALUES (?, ?, ?, 1, ?)'
    ).run(cart.id, productId, Math.min(product.stock, quantity), timestamp);
  }
  db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?').run(timestamp, cart.id);
  return cartPayload(user.id);
}, { auth: true });

on('PATCH', '/api/cart/items/:id', ({ params, body, user }) => {
  const cart = getCartRow(user.id);
  const item = db
    .prepare(
      `SELECT ci.*, p.stock, p.status FROM cart_items ci JOIN products p ON p.id = ci.product_id
        WHERE ci.id = ? AND ci.cart_id = ?`
    )
    .get(int(params.id), cart.id);
  if (!item) throw new ApiError(404, '购物车商品不存在');

  if (body.selected !== undefined) {
    db.prepare('UPDATE cart_items SET selected = ? WHERE id = ?').run(bool(body.selected) ? 1 : 0, item.id);
  }
  if (body.quantity !== undefined) {
    const quantity = Math.min(99, Math.max(1, int(body.quantity, 1)));
    if (quantity > item.stock) throw new ApiError(409, `库存仅剩 ${item.stock} 件`);
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(quantity, item.id);
  }
  db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?').run(nowStr(), cart.id);
  return cartPayload(user.id);
}, { auth: true });

on('DELETE', '/api/cart/items/:id', ({ params, user }) => {
  const cart = getCartRow(user.id);
  db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(int(params.id), cart.id);
  return cartPayload(user.id);
}, { auth: true });

on('DELETE', '/api/cart', ({ user }) => {
  const cart = getCartRow(user.id);
  db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
  return cartPayload(user.id);
}, { auth: true });

/* ------------------------------------------------------------------ */
/* 订单                                                                */
/* ------------------------------------------------------------------ */

on('POST', '/api/orders', ({ body, user }) => {
  const addressInfo = validateAddress(body);
  const cart = getCartRow(user.id);
  const requestedIds = Array.isArray(body.itemIds) ? body.itemIds.map((id) => int(id)) : [];

  let rows = db
    .prepare(
      `SELECT ci.id, ci.quantity, ci.product_id,
              p.name, p.image, p.price_cents, p.stock, p.status
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = ?
        ORDER BY ci.id`
    )
    .all(cart.id);

  if (requestedIds.length) rows = rows.filter((row) => requestedIds.includes(row.id));
  if (!rows.length) throw new ApiError(400, '请选择要结算的商品');

  for (const row of rows) {
    if (row.status !== 'on') throw new ApiError(409, `商品「${row.name}」已下架`);
    if (row.quantity > row.stock) throw new ApiError(409, `「${row.name}」库存不足，仅剩 ${row.stock} 件`);
  }

  const total = rows.reduce((sum, row) => sum + row.price_cents * row.quantity, 0);
  const itemCount = rows.reduce((sum, row) => sum + row.quantity, 0);
  const timestamp = nowStr();
  const orderNo = makeOrderNo();

  db.exec('BEGIN');
  try {
    const info = db
      .prepare(
        `INSERT INTO orders
          (order_no, user_id, total_cents, item_count, status, receiver_name, phone, address, remark, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
      )
      .run(
        orderNo,
        user.id,
        total,
        itemCount,
        addressInfo.receiverName,
        addressInfo.phone,
        addressInfo.address,
        addressInfo.remark,
        timestamp
      );
    const orderId = Number(info.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO order_items
        (order_id, product_id, product_name, product_image, unit_price_cents, quantity, subtotal_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const stockUpdate = db.prepare(
      'UPDATE products SET stock = stock - ?, sales = sales + ?, updated_at = ? WHERE id = ? AND stock >= ?'
    );
    const removeItem = db.prepare('DELETE FROM cart_items WHERE id = ?');

    for (const row of rows) {
      insertItem.run(
        orderId,
        row.product_id,
        row.name,
        row.image,
        row.price_cents,
        row.quantity,
        row.price_cents * row.quantity
      );
      const changed = stockUpdate.run(row.quantity, row.quantity, timestamp, row.product_id, row.quantity);
      if (Number(changed.changes) !== 1) throw new ApiError(409, `「${row.name}」库存不足，请重新选择`);
      removeItem.run(row.id);
    }
    db.exec('COMMIT');
    return { order: loadOrder(orderId), cart: cartPayload(user.id) };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}, { auth: true });

on('GET', '/api/orders', ({ user, query }) => {
  const status = str(query.get('status'), 20);
  const args = [user.id];
  let sql = 'SELECT * FROM orders WHERE user_id = ?';
  if (status && status !== 'all') {
    sql += ' AND status = ?';
    args.push(status);
  }
  sql += ' ORDER BY id DESC';
  const orders = db.prepare(sql).all(...args);
  return orders.map((order) => loadOrder(order.id));
}, { auth: true });

on('GET', '/api/orders/:id', ({ params, user }) => {
  const order = loadOrder(int(params.id));
  if (!order) throw new ApiError(404, '订单不存在');
  if (order.userId !== user.id && user.role !== 'admin') throw new ApiError(403, '无权查看该订单');
  return order;
}, { auth: true });

on('POST', '/api/orders/:id/pay', ({ params, body, user }) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(int(params.id));
  if (!order || order.user_id !== user.id) throw new ApiError(404, '订单不存在');
  if (order.status !== 'pending') throw new ApiError(409, '该订单当前状态不可支付');

  const method = str(body.method, 20) || 'alipay';
  if (!['alipay', 'wechat', 'card'].includes(method)) throw new ApiError(400, '不支持的支付方式');

  const timestamp = nowStr();
  const transactionNo = `MOCK${timestamp.replace(/\D/g, '')}${String(Date.now()).slice(-4)}`;
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO payments (order_id, user_id, method, amount_cents, status, transaction_no, paid_at)
       VALUES (?, ?, ?, ?, 'success', ?, ?)`
    ).run(order.id, user.id, method, order.total_cents, transactionNo, timestamp);
    db.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?").run(timestamp, order.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return loadOrder(order.id);
}, { auth: true });

on('POST', '/api/orders/:id/cancel', ({ params, user }) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(int(params.id));
  if (!order || order.user_id !== user.id) throw new ApiError(404, '订单不存在');
  if (order.status !== 'pending') throw new ApiError(409, '仅待付款订单可以取消');

  db.exec('BEGIN');
  try {
    restoreStock(order.id);
    db.prepare(
      "UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?"
    ).run(nowStr(), order.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return loadOrder(order.id);
}, { auth: true });

on('POST', '/api/orders/:id/confirm', ({ params, user }) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(int(params.id));
  if (!order || order.user_id !== user.id) throw new ApiError(404, '订单不存在');
  if (order.status !== 'shipped') throw new ApiError(409, '仅已发货订单可以确认收货');
  db.prepare("UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?").run(
    nowStr(),
    order.id
  );
  return loadOrder(order.id);
}, { auth: true });

/* ------------------------------------------------------------------ */
/* 管理端                                                              */
/* ------------------------------------------------------------------ */

on('GET', '/api/admin/stats', () => {
  const paid = "('paid','shipped','completed')";
  const today = nowStr().slice(0, 10);

  const revenue = db
    .prepare(`SELECT COALESCE(SUM(total_cents), 0) AS v FROM orders WHERE status IN ${paid}`)
    .get().v;
  const orderCount = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'user'").get().n;
  const productCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  const pendingPayment = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'").get().n;
  const pendingShip = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'").get().n;
  const lowStock = db
    .prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'on' AND stock <= 20")
    .get().n;
  const todayRevenue = db
    .prepare(
      `SELECT COALESCE(SUM(total_cents), 0) AS v FROM orders WHERE status IN ${paid} AND date(created_at) = ?`
    )
    .get(today).v;
  const todayOrders = db
    .prepare('SELECT COUNT(*) AS n FROM orders WHERE date(created_at) = ?')
    .get(today).n;
  const todayUsers = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE date(created_at) = ?')
    .get(today).n;

  const trend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = nowStr(new Date(Date.now() - i * 86400000)).slice(0, 10);
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(total_cents), 0) AS revenue, COUNT(*) AS orders
           FROM orders WHERE status IN ${paid} AND date(created_at) = ?`
      )
      .get(date);
    trend.push({ date, revenue: row.revenue, orders: row.orders });
  }

  const statusRows = db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status').all();
  const statusCounts = {};
  statusRows.forEach((row) => {
    statusCounts[row.status] = row.count;
  });

  const topProducts = db
    .prepare(
      `SELECT oi.product_name AS name, oi.product_image AS image,
              SUM(oi.quantity) AS qty, SUM(oi.subtotal_cents) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status IN ${paid}
        GROUP BY oi.product_name
        ORDER BY revenue DESC LIMIT 5`
    )
    .all();

  const lowStockRows = db
    .prepare(
      `SELECT id, name, stock, image FROM products WHERE status = 'on' AND stock <= 20
        ORDER BY stock ASC, id ASC LIMIT 6`
    )
    .all();

  const recentOrders = db
    .prepare(
      `SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id
        ORDER BY o.id DESC LIMIT 6`
    )
    .all()
    .map((row) => loadOrder(row.id, { includeUser: true }));

  return {
    totals: {
      revenue,
      orders: orderCount,
      users: userCount,
      products: productCount,
      pendingPayment,
      pendingShip,
      lowStock,
    },
    today: { revenue: todayRevenue, orders: todayOrders, users: todayUsers },
    trend,
    statusCounts,
    topProducts: topProducts.map((row) => ({
      name: row.name,
      image: row.image,
      quantity: row.qty,
      revenue: row.revenue,
    })),
    lowStockList: lowStockRows,
    recentOrders,
  };
}, { admin: true });

on('GET', '/api/admin/sales', ({ query }) => {
  const days = Math.min(90, Math.max(7, int(query.get('days'), 30)));
  const paid = "('paid','shipped','completed')";
  const start = nowStr(new Date(Date.now() - (days - 1) * 86400000)).slice(0, 10);

  const summary = db
    .prepare(
      `SELECT COALESCE(SUM(total_cents), 0) AS revenue, COUNT(*) AS orders,
              COALESCE(SUM(item_count), 0) AS items
         FROM orders WHERE status IN ${paid} AND date(created_at) >= date(?)`
    )
    .get(start);

  const trend = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = nowStr(new Date(Date.now() - i * 86400000)).slice(0, 10);
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(total_cents), 0) AS revenue, COUNT(*) AS orders
           FROM orders WHERE status IN ${paid} AND date(created_at) = ?`
      )
      .get(date);
    trend.push({ date, revenue: row.revenue, orders: row.orders });
  }

  const byCategory = db
    .prepare(
      `SELECT COALESCE(c.name, '其他') AS name, SUM(oi.subtotal_cents) AS revenue,
              SUM(oi.quantity) AS quantity
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE o.status IN ${paid} AND date(o.created_at) >= date(?)
        GROUP BY COALESCE(c.name, '其他')
        ORDER BY revenue DESC`
    )
    .all(start);

  const topProducts = db
    .prepare(
      `SELECT oi.product_name AS name, oi.product_image AS image,
              SUM(oi.quantity) AS quantity, SUM(oi.subtotal_cents) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status IN ${paid} AND date(o.created_at) >= date(?)
        GROUP BY oi.product_name
        ORDER BY revenue DESC LIMIT 8`
    )
    .all(start);

  const statusRows = db
    .prepare('SELECT status, COUNT(*) AS count FROM orders WHERE date(created_at) >= date(?) GROUP BY status')
    .all(start);
  const statusCounts = {};
  statusRows.forEach((row) => {
    statusCounts[row.status] = row.count;
  });

  return {
    days,
    start,
    summary: {
      revenue: summary.revenue,
      orders: summary.orders,
      items: summary.items,
      averageOrder: summary.orders ? Math.round(summary.revenue / summary.orders) : 0,
    },
    trend,
    byCategory: byCategory.map((row) => ({
      name: row.name,
      revenue: row.revenue,
      quantity: row.quantity,
    })),
    topProducts: topProducts.map((row) => ({
      name: row.name,
      image: row.image,
      quantity: row.quantity,
      revenue: row.revenue,
    })),
    statusCounts,
  };
}, { admin: true });

on('GET', '/api/admin/products', ({ query }) => {
  const keyword = str(query.get('keyword'), 50);
  const categoryId = int(query.get('categoryId'), 0);
  const status = str(query.get('status'), 10);
  const page = Math.max(1, int(query.get('page'), 1));
  const pageSize = Math.min(50, Math.max(1, int(query.get('pageSize'), 10)));

  const where = ['1 = 1'];
  const args = [];
  if (keyword) {
    where.push('(p.name LIKE ? OR p.subtitle LIKE ?)');
    const like = `%${keyword}%`;
    args.push(like, like);
  }
  if (categoryId) {
    where.push('p.category_id = ?');
    args.push(categoryId);
  }
  if (status && status !== 'all') {
    where.push('p.status = ?');
    args.push(status);
  }

  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${whereSql}`).get(...args).n;
  const rows = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.icon AS category_icon
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${whereSql}
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, (page - 1) * pageSize);

  return {
    items: rows.map(mapProduct),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}, { admin: true });

function productInput(body) {
  const name = str(body.name, 80);
  const subtitle = str(body.subtitle, 120);
  const description = str(body.description, 2000);
  const price = int(body.price, 0);
  const originalPrice = int(body.originalPrice, 0);
  const stock = int(body.stock, 0);
  const categoryId = int(body.categoryId, 0);
  const image = str(body.image, 500);
  const badge = str(body.badge, 10);
  const status = body.status === 'off' ? 'off' : 'on';

  if (name.length < 2) throw new ApiError(400, '请填写商品名称');
  if (price <= 0) throw new ApiError(400, '商品价格必须大于 0');
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) {
    throw new ApiError(400, '请选择有效的商品分类');
  }
  if (stock < 0) throw new ApiError(400, '库存不能为负数');

  return { name, subtitle, description, price, originalPrice, stock, categoryId, image, badge, status };
}

on('POST', '/api/admin/products', ({ body }) => {
  const input = productInput(body);
  const timestamp = nowStr();
  const info = db
    .prepare(
      `INSERT INTO products
        (name, subtitle, description, price_cents, original_price_cents, stock, sales, category_id, image, badge, rating, reviews, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 5.0, 0, ?, ?, ?)`
    )
    .run(
      input.name,
      input.subtitle,
      input.description,
      input.price,
      input.originalPrice,
      input.stock,
      input.categoryId,
      input.image,
      input.badge,
      input.status,
      timestamp,
      timestamp
    );
  return loadProduct(Number(info.lastInsertRowid));
}, { admin: true });

function loadProduct(id) {
  const row = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.icon AS category_icon
         FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`
    )
    .get(id);
  if (!row) throw new ApiError(404, '商品不存在');
  return mapProduct(row);
}

on('PUT', '/api/admin/products/:id', ({ params, body }) => {
  const id = int(params.id);
  if (!db.prepare('SELECT id FROM products WHERE id = ?').get(id)) throw new ApiError(404, '商品不存在');
  const input = productInput(body);
  db.prepare(
    `UPDATE products SET name = ?, subtitle = ?, description = ?, price_cents = ?, original_price_cents = ?,
        stock = ?, category_id = ?, image = ?, badge = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(
    input.name,
    input.subtitle,
    input.description,
    input.price,
    input.originalPrice,
    input.stock,
    input.categoryId,
    input.image,
    input.badge,
    input.status,
    nowStr(),
    id
  );
  return loadProduct(id);
}, { admin: true });

on('DELETE', '/api/admin/products/:id', ({ params }) => {
  const id = int(params.id);
  const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(id);
  if (!product) throw new ApiError(404, '商品不存在');
  const used = db.prepare('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?').get(id).n;
  if (used > 0) {
    // 已产生订单的商品保留快照，直接下架而不是物理删除
    db.prepare("UPDATE products SET status = 'off', updated_at = ? WHERE id = ?").run(nowStr(), id);
    return { deleted: false, archived: true, message: '该商品已有历史订单，已改为下架处理' };
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { deleted: true };
}, { admin: true });

on('PATCH', '/api/admin/products/:id/stock', ({ params, body }) => {
  const id = int(params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) throw new ApiError(404, '商品不存在');

  let next;
  if (body.stock !== undefined) {
    next = Math.max(0, int(body.stock, 0));
  } else {
    next = Math.max(0, product.stock + int(body.delta, 0));
  }
  db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').run(next, nowStr(), id);
  return loadProduct(id);
}, { admin: true });

on('GET', '/api/admin/categories', () => {
  return db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
         FROM categories c ORDER BY c.sort_order, c.id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      description: row.description,
      sortOrder: row.sort_order,
      productCount: row.product_count,
    }));
}, { admin: true });

on('POST', '/api/admin/categories', ({ body }) => {
  const name = str(body.name, 30);
  const icon = str(body.icon, 20) || 'home';
  const description = str(body.description, 60);
  const sortOrder = int(body.sortOrder, 99);
  if (name.length < 2) throw new ApiError(400, '请填写分类名称');
  if (db.prepare('SELECT id FROM categories WHERE name = ?').get(name)) {
    throw new ApiError(409, '分类名称已存在');
  }
  const info = db
    .prepare('INSERT INTO categories (name, icon, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, icon, description, sortOrder, nowStr());
  return { id: Number(info.lastInsertRowid) };
}, { admin: true });

on('PUT', '/api/admin/categories/:id', ({ params, body }) => {
  const id = int(params.id);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) throw new ApiError(404, '分类不存在');
  const name = str(body.name, 30) || category.name;
  const icon = str(body.icon, 20) || category.icon;
  const description = str(body.description, 60);
  const sortOrder = int(body.sortOrder, category.sort_order);
  const duplicate = db.prepare('SELECT id FROM categories WHERE name = ? AND id <> ?').get(name, id);
  if (duplicate) throw new ApiError(409, '分类名称已存在');
  db.prepare('UPDATE categories SET name = ?, icon = ?, description = ?, sort_order = ? WHERE id = ?').run(
    name,
    icon,
    description,
    sortOrder,
    id
  );
  return { id };
}, { admin: true });

on('DELETE', '/api/admin/categories/:id', ({ params }) => {
  const id = int(params.id);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!category) throw new ApiError(404, '分类不存在');
  const count = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(id).n;
  if (count > 0) throw new ApiError(409, `该分类下还有 ${count} 件商品，请先移走商品`);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return { deleted: true };
}, { admin: true });

on('GET', '/api/admin/orders', ({ query }) => {
  const status = str(query.get('status'), 20);
  const keyword = str(query.get('keyword'), 50);
  const page = Math.max(1, int(query.get('page'), 1));
  const pageSize = Math.min(50, Math.max(1, int(query.get('pageSize'), 10)));

  const where = ['1 = 1'];
  const args = [];
  if (status && status !== 'all') {
    where.push('o.status = ?');
    args.push(status);
  }
  if (keyword) {
    where.push('(o.order_no LIKE ? OR o.receiver_name LIKE ? OR u.username LIKE ? OR o.phone LIKE ?)');
    const like = `%${keyword}%`;
    args.push(like, like, like, like);
  }
  const whereSql = where.join(' AND ');

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE ${whereSql}`)
    .get(...args).n;
  const rows = db
    .prepare(
      `SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.id = o.user_id
        WHERE ${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, (page - 1) * pageSize);

  const counts = {};
  db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status')
    .all()
    .forEach((row) => {
      counts[row.status] = row.n;
    });

  return {
    items: rows.map((row) => loadOrder(row.id, { includeUser: true })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  };
}, { admin: true });

on('GET', '/api/admin/orders/:id', ({ params }) => {
  const order = loadOrder(int(params.id), { includeUser: true });
  if (!order) throw new ApiError(404, '订单不存在');
  return order;
}, { admin: true });

on('PATCH', '/api/admin/orders/:id/status', ({ params, body }) => {
  const id = int(params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) throw new ApiError(404, '订单不存在');
  const target = str(body.status, 20);

  const allowed = {
    pending: ['cancelled'],
    paid: ['shipped', 'cancelled'],
    shipped: ['completed'],
    completed: [],
    cancelled: [],
  };
  if (!(allowed[order.status] || []).includes(target)) {
    throw new ApiError(409, '当前订单状态不支持该操作');
  }

  const timestamp = nowStr();
  db.exec('BEGIN');
  try {
    if (target === 'shipped') {
      db.prepare("UPDATE orders SET status = 'shipped', shipped_at = ? WHERE id = ?").run(timestamp, id);
    } else if (target === 'completed') {
      db.prepare("UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?").run(timestamp, id);
    } else if (target === 'cancelled') {
      restoreStock(id);
      db.prepare(
        "UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?"
      ).run(timestamp, id);
      if (order.status === 'paid') {
        const paidPayment = db
          .prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'success'")
          .get(id);
        if (paidPayment) {
          db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?").run(paidPayment.id);
          db.prepare(
            `INSERT INTO payments (order_id, user_id, method, amount_cents, status, transaction_no, paid_at)
             VALUES (?, ?, ?, ?, 'refund', ?, ?)`
          ).run(
            id,
            order.user_id,
            paidPayment.method,
            paidPayment.amount_cents,
            `REF${timestamp.replace(/\D/g, '')}${String(Date.now()).slice(-4)}`,
            timestamp
          );
        }
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return loadOrder(id, { includeUser: true });
}, { admin: true });

on('GET', '/api/admin/users', ({ query }) => {
  const keyword = str(query.get('keyword'), 50);
  const args = [];
  let where = '1 = 1';
  if (keyword) {
    where = '(u.username LIKE ? OR u.email LIKE ?)';
    const like = `%${keyword}%`;
    args.push(like, like);
  }
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.role, u.status, u.created_at,
              (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
              (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o WHERE o.user_id = u.id AND o.status IN ('paid','shipped','completed')) AS total_spent,
              (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id) AS last_order_at
         FROM users u WHERE ${where}
        ORDER BY u.role DESC, u.id ASC`
    )
    .all(...args);

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    orderCount: row.order_count,
    totalSpent: row.total_spent,
    lastOrderAt: row.last_order_at,
  }));
}, { admin: true });

on('PATCH', '/api/admin/users/:id', ({ params, body, user }) => {
  const id = int(params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw new ApiError(404, '用户不存在');

  const status = body.status === 'disabled' ? 'disabled' : body.status === 'active' ? 'active' : null;
  const role = body.role === 'admin' ? 'admin' : body.role === 'user' ? 'user' : null;

  if (id === user.id && (status === 'disabled' || role === 'user')) {
    throw new ApiError(409, '不能停用或降级当前登录的管理员账号');
  }
  if (target.role === 'admin' && (role === 'user' || status === 'disabled')) {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get().n;
    if (admins <= 1) throw new ApiError(409, '系统至少需要保留一个可用的管理员');
  }

  db.prepare('UPDATE users SET status = COALESCE(?, status), role = COALESCE(?, role) WHERE id = ?').run(
    status,
    role,
    id
  );
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return publicUser(row);
}, { admin: true });

on('GET', '/api/admin/inventory', ({ query }) => {
  const keyword = str(query.get('keyword'), 50);
  const lowOnly = query.get('low') === '1';
  const where = ['1 = 1'];
  const args = [];
  if (keyword) {
    where.push('p.name LIKE ?');
    args.push(`%${keyword}%`);
  }
  if (lowOnly) where.push('p.stock <= 20');

  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.image, p.stock, p.sales, p.status, p.price_cents,
              c.name AS category_name
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.stock ASC, p.id ASC`
    )
    .all(...args);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    image: row.image,
    stock: row.stock,
    sales: row.sales,
    status: row.status,
    price: row.price_cents,
    categoryName: row.category_name,
  }));
}, { admin: true });

/* ------------------------------------------------------------------ */

export async function handleApi(req, res, url) {
  try {
    const route = matchRoute(req.method, url.pathname);
    if (!route) throw new ApiError(404, '接口不存在');

    const user = currentUser(req);
    if (route.admin && (!user || user.role !== 'admin')) {
      throw new ApiError(user ? 403 : 401, user ? '需要管理员权限' : '请先登录');
    }
    if (route.auth && !user) throw new ApiError(401, '请先登录');

    const params = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(route.match[index + 1]);
    });

    const needsBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const body = needsBody ? await readBody(req) : {};
    const data = await route.handler({ req, res, user, body, params, query: url.searchParams });
    sendJson(res, 200, { ok: true, data });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status >= 500) console.error('[api]', error);
    sendJson(res, status, { ok: false, error: error.message || '服务器开小差了' });
  }
}
