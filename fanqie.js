/**
 * 番茄小说网页读取核心。
 *
 * 这里只使用番茄小说网页公开返回的内容：
 *   - 书籍页 https://fanqienovel.com/page/<bookId>
 *   - 目录接口 https://fanqienovel.com/api/reader/directory/detail?bookId=<bookId>
 *   - 阅读页 https://fanqienovel.com/reader/<itemId>
 *
 * 番茄会在正文里使用私有区（PUA）字符做字体反爬；`fanqie-font.js` 保存了
 * 码位到汉字的映射，拿到正文后必须经过 `decodeFanqie()` 才能读。
 *
 * 不绕过登录、付费或 SVIP 限制：网页端只返回试读时，这里也会把
 * `locked: true` 如实交给调用方。
 */

import { BASE_FONT_MAP, SEARCH_FONT_MAP } from './fanqie-font.js';

export const FANQIE_ORIGIN = 'https://fanqienovel.com';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export class FanqieError extends Error {
  constructor(message, code = 'fanqie_error') {
    super(message);
    this.name = 'FanqieError';
    this.code = code;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertSafeId(value, label) {
  const text = String(value ?? '').trim();
  if (!/^\d{10,25}$/.test(text)) {
    throw new FanqieError(`${label} 必须是番茄的数字 ID`, 'invalid_id');
  }
  return text;
}

export function decodeEntities(input) {
  return String(input ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;|&ensp;|&emsp;/g, ' ')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&');
}

/** 去掉 HTML 标签，保留段落换行。 */
export function stripTags(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t\u00a0\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 把番茄正文中的 PUA 字符还原成汉字。
 * @param {string} input
 * @param {Record<string, string>} [table]
 */
export function decodeFanqie(input, table = BASE_FONT_MAP) {
  let out = '';
  for (const char of String(input ?? '')) {
    const code = char.codePointAt(0);
    if (code >= 0xe000 && code <= 0xf8ff) {
      out += table[code.toString(16)] ?? char;
    } else {
      out += char;
    }
  }
  return out;
}

function matchBraces(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseInitialState(html) {
  const marker = /__INITIAL_STATE__\s*=\s*/.exec(html);
  if (!marker) return null;
  const brace = html.indexOf('{', marker.index + marker[0].length);
  if (brace < 0) return null;
  const end = matchBraces(html, brace);
  if (end < 0) return null;
  const raw = html
    .slice(brace, end + 1)
    .replace(/([:[,]\s*)undefined\b/g, '$1null')
    .replace(/\bundefined\s*([,}\]])/g, 'null$1');
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readCookie(options) {
  const cookie = String(options?.cookie ?? '').trim();
  return cookie && /^[\x20-\x7e]+$/.test(cookie) ? cookie : '';
}

async function fetchText(url, options = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new FanqieError('只允许 HTTPS 请求', 'invalid_url');
  }
  if (
    parsed.hostname !== 'fanqienovel.com' &&
    parsed.hostname !== 'www.sogou.com' &&
    parsed.hostname !== 'www.bing.com'
  ) {
    throw new FanqieError(`不允许访问的站点：${parsed.hostname}`, 'invalid_url');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const outer = options.signal;
  const onAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onAbort, { once: true });
  }

  const headers = {
    'user-agent': USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    referer: options.referer ?? `${FANQIE_ORIGIN}/`,
  };
  if (parsed.hostname === 'fanqienovel.com') {
    const cookie = readCookie(options);
    if (cookie) headers.cookie = cookie;
  }

  const retries = Number.isInteger(options.retries) ? options.retries : 2;
  let lastError;
  try {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 450 * 2 ** (attempt - 1)));
      }
      try {
        const response = await fetch(parsed, {
          headers,
          redirect: 'follow',
          signal: controller.signal,
        });
        if (response.status === 429 || response.status >= 500) {
          lastError = new FanqieError(`番茄返回 HTTP ${response.status}`, 'http_error');
          continue;
        }
        if (!response.ok) {
          throw new FanqieError(`番茄返回 HTTP ${response.status}`, 'http_error');
        }
        const length = Number(response.headers.get('content-length') ?? 0);
        if (length > MAX_RESPONSE_BYTES) {
          throw new FanqieError('番茄页面过大，已拒绝读取', 'too_large');
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > MAX_RESPONSE_BYTES) {
          throw new FanqieError('番茄页面过大，已拒绝读取', 'too_large');
        }
        return buffer.toString('utf8');
      } catch (error) {
        if (controller.signal.aborted) {
          throw new FanqieError('请求已取消或超时', 'aborted');
        }
        lastError = error;
        if (error instanceof FanqieError && error.code === 'http_error' && !String(error.message).includes(' 5')) {
          throw error;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    if (outer) outer.removeEventListener('abort', onAbort);
  }
  throw lastError instanceof FanqieError
    ? lastError
    : new FanqieError(`读取番茄失败：${lastError?.message ?? '网络错误'}`, 'network_error');
}

function parseTags(page) {
  const raw = page?.categoryV2;
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map((entry) => decodeFanqie(String(entry?.Name ?? '')))
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
}

function flattenChapterEntries(input) {
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const value of node) walk(value);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const itemId = node.itemId ?? node.item_id;
    if (typeof itemId === 'string' && /^\d{10,25}$/.test(itemId)) {
      out.push({
        itemId,
        title: decodeFanqie(String(node.title ?? node.chapterTitle ?? '')),
        order: Number(node.realChapterOrder ?? node.order ?? out.length + 1) || out.length + 1,
        volume: String(node.volume_name ?? ''),
        locked: Boolean(node.isChapterLock) || Number(node.needPay ?? 0) > 0,
        wordCount: Number(node.chapterWordNumber ?? node.wordNumber ?? 0) || 0,
      });
      return;
    }
    for (const key of ['chapterList', 'chapterListWithVolume', 'chapters', 'volumeList']) {
      if (node[key]) walk(node[key]);
    }
  };
  walk(input);
  const seen = new Set();
  return out
    .filter((chapter) => {
      if (seen.has(chapter.itemId)) return false;
      seen.add(chapter.itemId);
      return true;
    })
    .map((chapter, index) => ({ ...chapter, index: index + 1, order: index + 1 }));
}

/** 解析书籍页的 `__INITIAL_STATE__`。 */
export function parseBookPage(html, fallbackBookId = '') {
  const state = parseInitialState(html);
  const page = state?.page;
  if (!page || !page.bookName) {
    throw new FanqieError('无法解析番茄书籍页（可能被风控拦截）', 'parse_book');
  }
  const chapters = flattenChapterEntries(page.chapterListWithVolume);
  const chapterCount = Number(page.chapterTotal ?? chapters.length) || chapters.length;
  return {
    bookId: String(page.bookId ?? fallbackBookId),
    title: decodeFanqie(String(page.bookName)),
    author: decodeFanqie(String(page.author ?? page.authorName ?? '')),
    cover: String(page.thumbUri ?? page.thumbUrl ?? ''),
    intro: stripTags(decodeFanqie(String(page.abstract ?? ''))),
    tags: parseTags(page),
    wordCount: Number(page.wordNumber ?? 0) || 0,
    status: Number(page.status ?? -1),
    chapterCount,
    lastChapterTitle: decodeFanqie(String(page.lastChapterTitle ?? '')),
    chapters,
  };
}

/** 目录接口返回结构。 */
export function parseDirectory(payload) {
  const data = payload?.data;
  if (!data) {
    throw new FanqieError(payload?.message || '番茄目录为空', 'parse_toc');
  }
  let chapters = flattenChapterEntries(data.chapterListWithVolume);
  if (chapters.length === 0) chapters = flattenChapterEntries(data.chapterList);
  if (chapters.length === 0 && Array.isArray(data.allItemIds)) {
    chapters = data.allItemIds.map((itemId, index) => ({
      itemId: String(itemId),
      title: '',
      order: index + 1,
      index: index + 1,
      volume: '',
      locked: false,
      wordCount: 0,
    }));
  }
  if (chapters.length === 0) {
    throw new FanqieError('番茄没有返回章节列表', 'parse_toc');
  }
  return chapters;
}

function extractDivByClass(html, className) {
  const pattern = new RegExp(
    `<div[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`,
    'i',
  );
  const start = pattern.exec(html);
  if (!start) return '';
  const bodyStart = html.indexOf('>', start.index) + 1;
  let cursor = bodyStart;
  let depth = 1;
  while (depth > 0 && cursor < html.length) {
    const open = html.indexOf('<div', cursor);
    const close = html.indexOf('</div', cursor);
    if (close < 0) break;
    if (open >= 0 && open < close) {
      depth += 1;
      cursor = open + 4;
    } else {
      depth -= 1;
      cursor = close + 5;
      if (depth === 0) return html.slice(bodyStart, close);
    }
  }
  return '';
}

/** 解析阅读页：正文、章节元信息、锁定状态。 */
export function parseChapterPage(html, fallbackItemId = '') {
  const state = parseInitialState(html);
  const chapter = state?.reader?.chapterData ?? state?.reader?.chapter ?? null;
  const itemId = String(chapter?.itemId ?? fallbackItemId);
  const locked =
    chapter?.isChapterLock === true ||
    Number(chapter?.needPay ?? 0) > 0 ||
    /购买SVIP还可享受网页畅读权益|本章为付费章节/.test(html);

  const fromState = chapter?.content
    ? String(chapter.content)
      .replace(/\\u002F/g, '/')
      .split(/<\/p\s*>/i)
      .map((part) => stripTags(part))
      .map((part) => decodeFanqie(part))
      .filter(Boolean)
    : [];
  const box = extractDivByClass(html, 'muye-reader-content');
  const fromHtml = box
    ? box
      .split(/<\/p\s*>/i)
      .map((part) => stripTags(part))
      .map((part) => decodeFanqie(part))
      .filter(Boolean)
    : [];
  let paragraphs = fromState.join('\n').length >= fromHtml.join('\n').length ? fromState : fromHtml;
  const title = decodeFanqie(
    String(chapter?.title ?? extractFirst(html, /<h1[^>]*class="[^"]*muye-reader-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ?? ''),
  ).trim();
  const bookName = decodeFanqie(
    String(chapter?.bookName ?? extractFirst(html, /<h1[^>]*class="[^"]*reader-book[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ?? ''),
  ).trim();
  if (!title && paragraphs.length === 0) {
    throw new FanqieError('无法解析番茄章节页（可能被风控拦截）', 'parse_chapter');
  }
  if (paragraphs.length > 0) {
    let first = paragraphs[0];
    if (title) first = first.replace(new RegExp(`^\\s*${escapeRegExp(title)}\\s*`), '');
    first = first
      .replace(/^本章字数：\s*\d+\s*字\s*/, '')
      .replace(/^更新时间：\s*[\d-]+\s*/, '')
      .trim();
    if (first) paragraphs[0] = first;
    else paragraphs.shift();
  }
  paragraphs = paragraphs.filter(
    (part) => !/^本章字数：\s*\d+\s*字$/.test(part) && !/^更新时间：\s*[\d-]+$/.test(part),
  );
  const content = paragraphs.join('\n\n');
  return {
    itemId,
    bookId: String(chapter?.bookId ?? ''),
    bookName,
    title,
    index: Number(chapter?.realChapterOrder ?? chapter?.order ?? 0) || 0,
    content,
    locked,
    preview: locked && content.length < 1800,
    wordCount: Number(chapter?.chapterWordNumber ?? chapter?.wordNumber ?? 0) || content.length,
    prevItemId: String(chapter?.preItemId ?? ''),
    nextItemId: String(chapter?.nextItemId ?? ''),
    serialCount: Number(chapter?.serialCount ?? 0) || 0,
  };
}

function extractFirst(html, regex) {
  const match = regex.exec(html);
  return match ? stripTags(match[1]) : '';
}

export async function fetchBook(bookId, options = {}) {
  const id = assertSafeId(bookId, 'bookId');
  const html = await fetchText(`${FANQIE_ORIGIN}/page/${id}`, {
    ...options,
    referer: `${FANQIE_ORIGIN}/`,
  });
  return parseBookPage(html, id);
}

export async function fetchToc(bookId, options = {}) {
  const id = assertSafeId(bookId, 'bookId');
  const text = await fetchText(
    `${FANQIE_ORIGIN}/api/reader/directory/detail?bookId=${encodeURIComponent(id)}`,
    {
      ...options,
      referer: `${FANQIE_ORIGIN}/page/${id}`,
      accept: 'application/json,text/plain,*/*',
    },
  );
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new FanqieError('番茄目录接口返回的不是 JSON（可能被风控拦截）', 'parse_toc');
  }
  return parseDirectory(payload);
}

export async function fetchChapter(itemId, options = {}) {
  const id = assertSafeId(itemId, 'itemId');
  const html = await fetchText(`${FANQIE_ORIGIN}/reader/${id}`, {
    ...options,
    referer: `${FANQIE_ORIGIN}/reader/${id}`,
  });
  return parseChapterPage(html, id);
}

/** 从链接/ID 中提取书籍或章节坐标。 */
export function parseBookReference(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (/^\d{10,25}$/.test(raw)) return { kind: 'id', value: raw };
  let match = raw.match(/fanqienovel\.com\/(?:page|book)\/(\d{10,25})/i);
  if (match) return { kind: 'book', value: match[1] };
  match = raw.match(/fanqienovel\.com\/reader\/(\d{10,25})/i);
  if (match) return { kind: 'item', value: match[1] };
  match = raw.match(/(?:book_id|bookId)[=/](\d{10,25})/);
  if (match) return { kind: 'book', value: match[1] };
  return null;
}

function parseSogou(html) {
  const results = [];
  const blocks = html.split('<div class="vrwrap"').slice(1);
  for (const block of blocks) {
    const idMatch =
      block.match(/data-url="https:\/\/fanqienovel\.com\/page\/(\d{10,25})"/) ??
      block.match(/https:\/\/fanqienovel\.com\/page\/(\d{10,25})/);
    if (!idMatch) continue;
    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const summaryMatch = block.match(
      /class="fz-mid[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const title = stripTags(titleMatch?.[1] ?? '')
      .replace(/[_|].*$/, '')
      .trim();
    const intro = stripTags(summaryMatch?.[1] ?? '').slice(0, 220);
    if (!title && !intro) continue;
    results.push({ bookId: idMatch[1], title, intro });
  }
  const seen = new Set();
  return results.filter((item) => {
    if (seen.has(item.bookId)) return false;
    seen.add(item.bookId);
    return true;
  });
}

async function searchIndex(query, options) {
  const quoted = query.includes(' ') ? `"${query}"` : query;
  const sogou = `https://www.sogou.com/web?query=${encodeURIComponent(`site:fanqienovel.com/page ${quoted}`)}`;
  let html;
  try {
    html = await fetchText(sogou, {
      ...options,
      referer: 'https://www.sogou.com/',
      retries: 1,
      timeoutMs: 12_000,
    });
  } catch {
    return [];
  }
  const raw = parseSogou(html);
  if (raw.length === 0) return [];

  // 搜索结果标题常是“某章 ...”，用真实书籍页校正，并过滤风控/失败项。
  const enriched = await Promise.all(
    raw.slice(0, 6).map(async (item) => {
      try {
        const book = await fetchBook(item.bookId, options);
        return {
          bookId: book.bookId,
          title: book.title,
          author: book.author,
          intro: book.intro || item.intro,
          cover: book.cover,
          chapterCount: book.chapterCount,
          tags: book.tags,
          source: 'sogou',
        };
      } catch {
        return null;
      }
    }),
  );
  const needle = query.replace(/\s+/g, '').toLowerCase();
  return enriched
    .filter(Boolean)
    .map((book) => {
      const haystack = `${book.title}${book.author}${book.intro}`.replace(/\s+/g, '').toLowerCase();
      let score = 0;
      if (book.title.replace(/\s+/g, '').toLowerCase() === needle) score += 100;
      else if (book.title.includes(query)) score += 50;
      if (haystack.includes(needle)) score += 20;
      if (book.author.includes(query)) score += 10;
      return { ...book, score };
    })
    .filter((book) => book.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ score, ...book }) => book);
}

/**
 * 搜索番茄小说。
 * 先尝试把输入当链接/ID；否则走网页索引（结果有限，可能为空）。
 * @returns {Promise<Array<object>>}
 */
export async function searchBooks(query, options = {}) {
  const text = String(query ?? '').trim();
  if (!text) return [];
  const ref = parseBookReference(text);
  if (ref?.kind === 'book') {
    const book = await fetchBook(ref.value, options);
    return [toSearchResult(book)];
  }
  if (ref?.kind === 'item') {
    const chapter = await fetchChapter(ref.value, options);
    if (!chapter.bookId) return [];
    const book = await fetchBook(chapter.bookId, options);
    return [toSearchResult(book)];
  }
  if (ref?.kind === 'id') {
    try {
      const book = await fetchBook(ref.value, options);
      return [toSearchResult(book)];
    } catch {
      const chapter = await fetchChapter(ref.value, options);
      if (!chapter.bookId) return [];
      const book = await fetchBook(chapter.bookId, options);
      return [toSearchResult(book)];
    }
  }
  return searchIndex(text, options);
}

function toSearchResult(book) {
  return {
    bookId: book.bookId,
    title: book.title,
    author: book.author,
    intro: book.intro,
    cover: book.cover,
    chapterCount: book.chapterCount,
    tags: book.tags,
    source: 'direct',
  };
}

/**
 * 把用户输入解析成书籍 ID。支持链接、ID、书名（走搜索）。
 * @returns {Promise<{bookId: string, title?: string}>}
 */
export async function resolveBookId(input, options = {}) {
  const text = String(input ?? '').trim();
  if (!text) throw new FanqieError('缺少书籍链接、ID 或书名', 'missing_book');
  const ref = parseBookReference(text);
  if (ref?.kind === 'book') return { bookId: ref.value };
  if (ref?.kind === 'item') {
    const chapter = await fetchChapter(ref.value, options);
    if (!chapter.bookId) throw new FanqieError('没能从章节链接反查出书籍 ID', 'missing_book');
    return { bookId: chapter.bookId, title: chapter.bookName };
  }
  if (ref?.kind === 'id') {
    try {
      const book = await fetchBook(ref.value, options);
      return { bookId: book.bookId, title: book.title };
    } catch {
      const chapter = await fetchChapter(ref.value, options);
      if (!chapter.bookId) throw new FanqieError('没能识别这串数字对应的书籍', 'missing_book');
      return { bookId: chapter.bookId, title: chapter.bookName };
    }
  }
  const results = await searchIndex(text, options);
  if (results.length === 0) {
    throw new FanqieError(
      `没有搜到《${text}》。番茄的搜索页需要登录态，插件只能走网页索引；请直接粘贴 fanqienovel.com 的书籍链接或书籍 ID。`,
      'not_found',
    );
  }
  return { bookId: results[0].bookId, title: results[0].title };
}

/** 供 UI 使用的章节简介。 */
export function summarizeChapters(chapters, limit = 12) {
  return chapters.slice(0, limit).map((chapter) => ({
    index: chapter.index,
    itemId: chapter.itemId,
    title: chapter.title || `第 ${chapter.index} 章`,
    locked: chapter.locked,
  }));
}

export { SEARCH_FONT_MAP };
