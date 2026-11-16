import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';
import { CATEGORIES, PRODUCTS } from './catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'shop.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** 统一的本地时间格式：YYYY-MM-DD HH:mm:ss（Asia/Shanghai） */
export function nowStr(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function stamp(daysAgo = 0, hour = 10, minute = 0) {
  const target = new Date(Date.now() - daysAgo * 86400000);
  const ymd = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
  return `${ymd} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT 'home',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  subtitle             TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  price_cents          INTEGER NOT NULL,
  original_price_cents INTEGER NOT NULL DEFAULT 0,
  stock                INTEGER NOT NULL DEFAULT 0,
  sales                INTEGER NOT NULL DEFAULT 0,
  category_id          INTEGER,
  image                TEXT NOT NULL DEFAULT '',
  badge                TEXT NOT NULL DEFAULT '',
  rating               REAL NOT NULL DEFAULT 4.8,
  reviews              INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'on',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id    INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL DEFAULT 1,
  selected   INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no      TEXT NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL,
  total_cents   INTEGER NOT NULL,
  item_count    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  receiver_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  address       TEXT NOT NULL,
  remark        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  paid_at       TEXT,
  shipped_at    TEXT,
  completed_at  TEXT,
  cancelled_at  TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL,
  product_name     TEXT NOT NULL,
  product_image    TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER NOT NULL,
  quantity         INTEGER NOT NULL,
  subtotal_cents   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL,
  method         TEXT NOT NULL,
  amount_cents   INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'success',
  transaction_no TEXT NOT NULL,
  paid_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
`;

export function initSchema() {
  db.exec(SCHEMA);
}

const img = (prompt, size = 'square_hd') =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=${size}`;


const DEMO_ORDERS = [
  // 整机 0-15 / CPU 16-35 / 显卡 36-63 / 主板 64-85 / 内存 86-105 / 固态 106-125 / 散热 126-153 / 机箱 154-177 / 电源 178-199
  { user: 2, days: 12, hour: 10, items: [[0, 1], [16, 1]], status: 'completed' },
  { user: 3, days: 11, hour: 15, items: [[38, 1], [178, 1]], status: 'completed' },
  { user: 4, days: 9, hour: 9, items: [[64, 1], [86, 2]], status: 'completed' },
  { user: 2, days: 8, hour: 20, items: [[126, 1]], status: 'completed' },
  { user: 3, days: 7, hour: 13, items: [[1, 1], [108, 1]], status: 'completed' },
  { user: 4, days: 6, hour: 11, items: [[19, 1], [41, 1]], status: 'completed' },
  { user: 2, days: 5, hour: 16, items: [[36, 1]], status: 'completed' },
  { user: 3, days: 4, hour: 10, items: [[136, 1], [156, 1]], status: 'completed' },
  { user: 4, days: 3, hour: 14, items: [[4, 1], [68, 1]], status: 'shipped' },
  { user: 2, days: 3, hour: 19, items: [[110, 2]], status: 'shipped' },
  { user: 3, days: 2, hour: 9, items: [[155, 1], [182, 1]], status: 'shipped' },
  { user: 4, days: 2, hour: 21, items: [[87, 1], [107, 1]], status: 'paid' },
  { user: 2, days: 1, hour: 12, items: [[20, 1], [39, 1]], status: 'paid' },
  { user: 3, days: 1, hour: 18, items: [[88, 1]], status: 'pending' },
  { user: 4, days: 0, hour: 9, items: [[5, 1], [130, 1]], status: 'pending' },
  { user: 2, days: 5, hour: 12, items: [[160, 1]], status: 'cancelled' },
  { user: 3, days: 2, hour: 16, items: [[180, 1]], status: 'cancelled' },
  { user: 2, days: 0, hour: 10, items: [[13, 1], [62, 1]], status: 'paid' },
  { user: 3, days: 0, hour: 11, items: [[128, 1]], status: 'completed' },
];

const PAY_METHODS = ['alipay', 'wechat', 'card'];

export function seedIfEmpty() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (existing && existing.n > 0) return false;

  const createdAt = stamp(40, 9);
  const insertUser = db.prepare(
    'INSERT INTO users (username, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertUser.run('admin', 'admin@nova.shop', hashPassword('admin123'), 'admin', 'active', createdAt);
  insertUser.run('zhangwei', 'zhangwei@example.com', hashPassword('123456'), 'user', 'active', stamp(32, 10));
  insertUser.run('linlin', 'linlin@example.com', hashPassword('123456'), 'user', 'active', stamp(20, 14));
  insertUser.run('chenyu', 'chenyu@example.com', hashPassword('123456'), 'user', 'active', stamp(9, 16));

  const insertCategory = db.prepare(
    'INSERT INTO categories (name, icon, description, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const categoryIds = {};
  CATEGORIES.forEach((category, index) => {
    const info = insertCategory.run(category.name, category.icon, category.desc, index, createdAt);
    categoryIds[category.slug] = Number(info.lastInsertRowid);
  });

  const insertProduct = db.prepare(`
    INSERT INTO products
      (name, subtitle, description, price_cents, original_price_cents, stock, sales, category_id, image, badge, rating, reviews, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'on', ?, ?)
  `);

  const productIds = [];
  PRODUCTS.forEach((product, index) => {
    const info = insertProduct.run(
      product.name,
      product.subtitle,
      product.desc,
      product.price,
      product.original,
      product.stock,
      categoryIds[product.cat],
      product.image || img(product.prompt),
      product.badge,
      product.rating,
      product.reviews,
      stamp(((PRODUCTS.length - index) % 30) + 1, 10),
      stamp(3, 11)
    );
    productIds.push(Number(info.lastInsertRowid));
  });

  const insertOrder = db.prepare(`
    INSERT INTO orders
      (order_no, user_id, total_cents, item_count, status, receiver_name, phone, address, remark, created_at, paid_at, shipped_at, completed_at, cancelled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, product_image, unit_price_cents, quantity, subtotal_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPayment = db.prepare(`
    INSERT INTO payments (order_id, user_id, method, amount_cents, status, transaction_no, paid_at)
    VALUES (?, ?, ?, ?, 'success', ?, ?)
  `);
  const decreaseStock = db.prepare('UPDATE products SET stock = stock - ?, sales = sales + ? WHERE id = ?');

  const receiverInfo = {
    2: { name: '张伟', phone: '13800138001', address: '上海市徐汇区漕溪北路 88 号 1203 室' },
    3: { name: '林琳', phone: '13900139002', address: '杭州市西湖区文三路 478 号 A 座 806' },
    4: { name: '陈宇', phone: '13700137003', address: '成都市高新区天府大道 1199 号 3 栋 1502' },
  };

  DEMO_ORDERS.forEach((order, index) => {
    const created = stamp(order.days, order.hour, 5 + (index % 40));
    const receiver = receiverInfo[order.user];
    const lines = order.items.map(([productIndex, quantity]) => {
      const product = PRODUCTS[productIndex];
      return {
        productId: productIds[productIndex],
        name: product.name,
        image: img(product.prompt),
        price: product.price,
        quantity,
        subtotal: product.price * quantity,
      };
    });
    const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
    const orderNo = `NV${created.replace(/\D/g, '')}${String(1001 + index)}`;

    const paidAt = order.status === 'pending' || order.status === 'cancelled' ? null : created;
    const shippedAt = ['shipped', 'completed'].includes(order.status) ? stamp(Math.max(order.days - 1, 0), order.hour, 30) : null;
    const completedAt = order.status === 'completed' ? stamp(Math.max(order.days - 2, 0), order.hour, 50) : null;
    const cancelledAt = order.status === 'cancelled' ? stamp(order.days, order.hour, 20) : null;

    const info = insertOrder.run(
      orderNo,
      order.user,
      total,
      itemCount,
      order.status,
      receiver.name,
      receiver.phone,
      receiver.address,
      index % 3 === 0 ? '请放在门口快递柜，谢谢' : '',
      created,
      paidAt,
      shippedAt,
      completedAt,
      cancelledAt
    );
    const orderId = Number(info.lastInsertRowid);

    lines.forEach((line) => {
      insertOrderItem.run(orderId, line.productId, line.name, line.image, line.price, line.quantity, line.subtotal);
      if (order.status !== 'cancelled') {
        decreaseStock.run(line.quantity, line.quantity, line.productId);
      }
    });

    if (paidAt) {
      insertPayment.run(orderId, order.user, PAY_METHODS[index % PAY_METHODS.length], total, `MOCK${created.replace(/\D/g, '')}${100 + index}`, paidAt);
    }
  });

  // 给演示账号预置购物车，方便直接体验结算流程
  const demoCart = db.prepare('INSERT INTO carts (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(2, stamp(0, 8), stamp(0, 8));
  const insertCartItem = db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity, selected, created_at) VALUES (?, ?, ?, 1, ?)');
  insertCartItem.run(Number(demoCart.lastInsertRowid), productIds[39], 1, stamp(0, 8));
  insertCartItem.run(Number(demoCart.lastInsertRowid), productIds[178], 1, stamp(0, 9));

  return true;
}

export function bootstrap() {
  initSchema();
  const seeded = seedIfEmpty();
  return { seeded };
}
