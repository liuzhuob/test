// 抓取真实商品图：按型号检索商品实拍图，下载到 public/images/products/
// 用法：node scripts/fetch-product-images.mjs
//      LIMIT=8 node scripts/fetch-product-images.mjs            // 只抓前 8 个，用于抽查
//      INDICES=0,16,36 node scripts/fetch-product-images.mjs    // 只抓指定下标
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PRODUCTS } from '../server/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'products');
fs.mkdirSync(OUT_DIR, { recursive: true });

// 已下载图片的内容指纹：避免不同商品拿到同一张图
const usedHashes = new Set();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 图库素材站 / 无关站点：图片通常是配图而非商品实拍
const BLOCK_HOSTS = [
  '699pic', 'veer.com', 'vcg.com', 'gettyimages', 'zcool', '58pic', 'photophoto', 'tuchong',
  'pinterest', 'facebook', 'youtube', 'ytimg', 'sinaimg', 'bilibili', 'douyin', 'weibo',
  'baidu.com/s?', 'gstatic',
];
const BLOCK_WORDS = ['logo', 'icon', 'sprite', 'avatar', 'banner', '壁纸', '表情包', '地图'];
const REVIEW_WORDS = ['拆解', '拆机', '评测', '首测', '实测', '开箱', '横评', '维修', '议价', '二手'];

// 型号中的泛化词，命中与否不代表匹配
const STOP_TOKENS = new Set([
  'rtx', 'gtx', 'amd', 'intel', 'nvidia', 'core', 'ryzen', 'plus', 'pro', 'max', 'super',
  'with', 'the', 'and', 'gaming', 'ddr5', 'ddr4', 'pcie', 'oc', 'gen',
]);

const PREBUILT_QUERIES = [
  '游戏台式主机 整机 装机',
  '白色海景房 游戏主机 整机',
  'ITX 迷你主机 整机',
  '水冷游戏主机 整机',
  '办公台式电脑 主机 整机',
];

// 品牌官网：产品图多为白底官图，最优先
const OFFICIAL_HOSTS = [
  'asus.com', 'msi.com', 'gigabyte.com', 'sapphiretech', 'powercolor', 'colorful.cn', 'galax',
  'nvidia.com', 'amd.com', 'intel.com', 'samsung.com', 'westerndigital.com', 'crucial.com',
  'kioxia', 'seagate.com', 'kingston.com', 'corsair.com', 'gskill.com', 'adata.com',
  'thermalright', 'deepcool', 'noctua', 'nzxt.com', 'lian-li.com', 'phanteks', 'fractal-design',
  'coolermaster', 'seasonic', 'super-flower', 'ant-pc', 'jonsbo', 'sama', 'aigo', 'in-win',
  'asrock.com', 'acer.com', 'predator', 'gloway', 'kingbank', 'vastarmor', 'valkyrie',
  'pccooler', 'zhi-tai', 'ymtc',
];

// 海外零售商：主图基本是白底产品图
const RETAIL_HOSTS = [
  'ldlc.com', 'alternate.de', 'scan.co.uk', 'cyberport', 'mindfactory', 'newegg',
  'pccasegear', 'caseking', 'proshop', 'galaxus', 'topachat', 'materiel.net',
  'overclockers', 'ebuyer', 'komplett', 'megekko', 'azerty', 'informatique',
];

// 资讯站 / 自媒体 / 促销页：图片常带文字横幅或水印，降权
const NOISE_HOSTS = [
  'mbd.baidu.com', 'baijiahao', 'smzdm', 'sohu', 'sina', '10jqka', 'bilibili', 'zhihu',
  'toutiao', 'qq.com', '163.com', 'ifeng', 'xueqiu', 'douban', 'tieba', 'weixin',
  'item.jd.com', 'm.jd.com', 'shop.jd.com', 'tmall', 'taobao',
];

// 标题必须命中对应品类的词，避免抓到无关配图
const KEYWORDS = {
  prebuilt: ['主机', '台式', '电脑', '整机', 'pc'],
  cpu: ['cpu', '处理器', 'ryzen', 'core', '酷睿', '锐龙', '盒装'],
  gpu: ['显卡', 'rtx', 'rx', 'geforce', 'radeon', 'gpu'],
  mb: ['主板', 'b650', 'b760', 'b850', 'x670', 'x870', 'z790', 'z890', 'a620', 'lga'],
  ram: ['内存', 'ddr5', 'ddr4', '内存条'],
  ssd: ['固态', 'ssd', '硬盘', 'nvme', 'm.2'],
  cooling: ['散热', '水冷', '风扇', '冷排', '风冷', '一体式'],
  case: ['机箱', '海景房', '塔式'],
  psu: ['电源', '金牌', '全模组', 'atx'],
};

const tokensOf = (name) => {
  const raw = [
    ...(name.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) || []),
    ...(name.match(/[\u4e00-\u9fa5]{2,}/g) || []),
  ];
  return [...new Set(raw.map((token) => token.toLowerCase()))].filter(
    (token) => token.length >= 2 && !STOP_TOKENS.has(token)
  );
};

const queryOf = (product, index) => {
  if (product.cat === 'prebuilt') return PREBUILT_QUERIES[index % PREBUILT_QUERIES.length];
  return product.name;
};

const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

const brandOf = (name) => {
  const match = name.match(/^[\u4e00-\u9fa5]{2,}/);
  return match ? match[0].slice(0, 2) : '';
};

const scoreItem = (item, tokens, cat, brand) => {
  const title = (item.fromPageTitleEnc || item.fromPageTitle || '').toLowerCase();
  const host = `${item.fromURLHost || ''} ${item.middleURL || ''}`.toLowerCase();
  const url = item.middleURL || '';

  if (!url) return -1;
  if (BLOCK_HOSTS.some((h) => host.includes(h) || url.includes(h))) return -1;
  if (BLOCK_WORDS.some((w) => title.includes(w) || url.toLowerCase().includes(w))) return -1;

  // 标题必须命中品类词、品牌词，并且命中足够多的型号词（RELAX 模式放宽，用于冷门型号补抓）
  const relax = process.env.RELAX === '1';
  const words = KEYWORDS[cat] || [];
  if (!relax && words.length && !words.some((word) => title.includes(word))) return -1;
  if (!relax && brand && !title.includes(brand)) return -1;

  let hits = 0;
  for (const token of tokens) if (title.includes(token)) hits += 1;
  if (!relax && hits < Math.min(2, tokens.length)) return -1;
  if (relax && hits === 0) return -1;

  let score = hits * 10;
  // 拆解 / 评测 / 二手类图片通常不是干净产品图
  if (REVIEW_WORDS.some((word) => title.includes(word))) score -= 45;
  const full = `${host} ${url}`.toLowerCase();
  if (OFFICIAL_HOSTS.some((h) => full.includes(h))) score += 80;
  else if (RETAIL_HOSTS.some((h) => full.includes(h))) score += 60;
  else if (full.includes('zol.com.cn') || full.includes('pconline')) score += 24;
  else if (full.includes('360buyimg')) score += 18;
  else if (full.includes('jd.com')) score += 10;
  if (NOISE_HOSTS.some((h) => full.includes(h))) score -= 35;

  const w = Number(item.width) || 0;
  const h = Number(item.height) || 0;
  if (w >= 500 && h >= 500) score += 8;
  if (w && h && w / h > 0.65 && w / h < 1.55) score += 10;
  if (w && h && (w / h > 2.4 || h / w > 2.4)) score -= 14;

  return score;
};

async function fetchText(url, timeout = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: ctrl.signal,
    });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function sizeOf(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length > 24) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    }
    if (kind === 'VP8 ') {
      return {
        w: buf.readUInt16LE(26) & 0x3fff,
        h: buf.readUInt16LE(28) & 0x3fff,
      };
    }
    if (kind === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
    }
  }
  return null;
}

async function download(url, index, timeout = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://image.baidu.com/',
        Accept: 'image/*,*/*;q=0.8',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 12000) return null;
    const size = sizeOf(buf);
    if (!size || size.w < 400 || size.h < 300) return null;
    if (size.w / size.h > 2.4 || size.h / size.w > 2.4) return null;

    const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
    const hash = createHash('md5').update(buf).digest('hex');
    if (usedHashes.has(hash)) return null;
    usedHashes.add(hash);
    for (const other of ['.jpg', '.png', '.webp', '.jpeg']) {
      const stale = path.join(OUT_DIR, `${index}${other}`);
      if (other !== ext && fs.existsSync(stale)) fs.rmSync(stale, { force: true });
    }
    fs.writeFileSync(path.join(OUT_DIR, `${index}${ext}`), buf);
    return { file: `/images/products/${index}${ext}`, size: buf.length };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseBaidu(text) {
  const cleaned = text.replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}');
  try {
    const json = JSON.parse(cleaned);
    return (json.data || []).filter((item) => item && item.middleURL);
  } catch {
    return [];
  }
}

async function searchImages(query, page = 0) {
  const url =
    'https://image.baidu.com/search/acjson?tn=resultjson_com&logid=1&ipn=rj&ct=201326592&is=&fp=result' +
    `&word=${encodeURIComponent(query)}&pn=${page}&rn=30&gsm=1e`;
  const html = await fetchText(url);
  return html ? parseBaidu(html) : [];
}

// 已使用的图片地址：避免不同商品复用同一张图
const usedUrls = new Set();

async function grab(index, product) {
  const isPrebuilt = product.cat === 'prebuilt';
  // 整机是自有型号，没有可匹配的市场标题，只按品类词筛选
  const tokens = isPrebuilt ? [] : tokensOf(product.name).filter((token) => token.length >= 3);
  const brand = isPrebuilt ? '' : brandOf(product.name);
  const attempts = [{ query: queryOf(product, index), page: 0 }];
  if (isPrebuilt) {
    attempts.push({ query: PREBUILT_QUERIES[(index + 2) % PREBUILT_QUERIES.length], page: 30 });
    attempts.push({ query: '游戏电脑主机 整机 侧透', page: 60 });
  } else {
    attempts.push({ query: `${product.name} 官网`, page: 0 });
    attempts.push({ query: `${product.name} 京东`, page: 0 });
  }

  for (const { query, page } of attempts) {
    const items = await searchImages(query, page);
    if (!items.length) continue;

    const ranked = items
      .map((item, order) => ({ item, order, score: scoreItem(item, tokens, product.cat, brand) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order);

    if (process.env.DEBUG) {
      console.log(`[${index}] q=${query} pn=${page} items=${items.length} 通过=${ranked.length}`);
      ranked.slice(0, 4).forEach((entry) => {
        console.log(
          `   ${entry.score} ${entry.item.width}x${entry.item.height} ${String(entry.item.fromPageTitleEnc || '').slice(0, 36)}`
        );
      });
    }

    for (const entry of ranked.slice(0, 5)) {
      if (usedUrls.has(entry.item.middleURL)) continue;
      const saved = await download(entry.item.middleURL, index);
      if (saved) {
        usedUrls.add(entry.item.middleURL);
        return { ...saved, title: entry.item.fromPageTitleEnc || '' };
      }
    }
  }
  return null;
}

const startedAt = Date.now();
const result = {};
const LIMIT = Number(process.env.LIMIT || 0);
const INDICES = (process.env.INDICES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map(Number)
  .filter((value) => Number.isInteger(value) && value >= 0 && value < PRODUCTS.length);

const list = INDICES.length
  ? INDICES.map((index) => ({ index, product: PRODUCTS[index] }))
  : PRODUCTS.slice(0, LIMIT || PRODUCTS.length).map((product, index) => ({ index, product }));
const total = list.length;
let cursor = 0;
let done = 0;

// 补抓时把其它商品已用的图片指纹载入，避免再次撞图
const targetSet = new Set(list.map((entry) => entry.index));
for (const file of fs.readdirSync(OUT_DIR)) {
  const match = file.match(/^(\d+)\.(jpe?g|png|webp)$/i);
  if (!match || targetSet.has(Number(match[1]))) continue;
  const buf = fs.readFileSync(path.join(OUT_DIR, file));
  usedHashes.add(createHash('md5').update(buf).digest('hex'));
}

async function worker() {
  while (cursor < total) {
    const { index, product } = list[cursor++];
    let got = null;
    for (let attempt = 0; attempt < 2 && !got; attempt += 1) {
      got = await grab(index, product);
      if (!got) await new Promise((resolve) => setTimeout(resolve, 900));
    }
    if (got) result[index] = got.file;
    done += 1;
    if (done % 10 === 0) console.log(`进度 ${done}/${total}，成功 ${Object.keys(result).length}`);
  }
}

if (!process.env.MAP_ONLY) await Promise.all([worker(), worker(), worker(), worker()]);

if (!INDICES.length) {
  // 以磁盘上的实际文件为准生成映射，便于分批补抓后合并
  const map = {};
  for (const file of fs.readdirSync(OUT_DIR)) {
    const match = file.match(/^(\d+)\.(jpe?g|png|webp)$/i);
    if (!match) continue;
    const index = Number(match[1]);
    if (index < PRODUCTS.length) map[index] = `/images/products/${file}`;
  }
  const lines = [
    '// 由 scripts/fetch-product-images.mjs 自动生成：真实商品图片（本地缓存）',
    'export const PRODUCT_IMAGES = {',
    ...Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b)
      .map((index) => `  ${index}: '${map[index]}',`),
    '};',
    '',
  ];
  fs.writeFileSync(path.join(ROOT, 'server', 'product-images.js'), lines.join('\n'), 'utf8');
}

console.log(
  `完成：${Object.keys(result).length}/${total} 张，用时 ${Math.round((Date.now() - startedAt) / 1000)}s`
);
