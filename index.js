/**
 * dsh-fanqie-reader — Host half.
 *
 * 左侧栏是「番茄书虫」阅读器；DeepSeek 的 faqie_* 工具只在用户绑定的
 * 那一个 DSH 会话里注册。其余会话看不到这些工具，符合“把看小说这件事
 * 局限在一个会话里”的要求。
 *
 * 数据都放在 $DSH_HOME/fanqie-reader/state.json；只使用番茄网页公开内容，
 * 不绕过登录、付费或 SVIP 限制。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import {
  FanqieError,
  fetchBook,
  fetchChapter,
  fetchToc,
  parseBookReference,
  resolveBookId,
  searchBooks,
  summarizeChapters,
} from './fanqie.js';
import { createFanqieApp } from './fanqie-app.js';
import { createBridge, isWithinSchedule } from './bridge.js';
import { createSetup } from './setup.js';
import { createCapture } from './capture.js';
import { importCapture } from './capture-import.js';
import { isTrustedRequest } from './trust.js';
import {
  fetchAccount,
  makeLoginSession,
  pollLogin,
  publicLoginSession,
  startLogin,
} from './auth.js';

export const name = 'dsh-fanqie-reader';
export const inject = ['webServer', 'agents', 'tools'];

const PREFIX = '/fanqie-reader';
const STATE_VERSION = 1;
const MAX_JSON_BYTES = 1024 * 1024;
const READ_LIMIT = 16_000;

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const DATA_DIR = path.join(HOME, 'fanqie-reader');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function defaultInteractionSettings() {
  return { dailyLimit: 10, minGapSeconds: 20, autoPost: false };
}

function normalizeInteractionSettings(raw) {
  const base = defaultInteractionSettings();
  if (!raw || typeof raw !== 'object') return base;
  const dailyLimit = Number(raw.dailyLimit ?? base.dailyLimit);
  const minGapSeconds = Number(raw.minGapSeconds ?? base.minGapSeconds);
  return {
    dailyLimit: Math.min(50, Math.max(1, Number.isFinite(dailyLimit) ? Math.round(dailyLimit) : base.dailyLimit)),
    minGapSeconds: Math.min(300, Math.max(5, Number.isFinite(minGapSeconds) ? Math.round(minGapSeconds) : base.minGapSeconds)),
    autoPost: Boolean(raw.autoPost),
  };
}

function defaultRuntimeSchedule() {
  return {
    enabled: true,
    start: '00:30',
    end: '08:30',
    days: [1, 2, 3, 4, 5, 6, 7],
    timezone: 'Asia/Shanghai',
  };
}

function normalizeRuntimeSchedule(raw) {
  const base = defaultRuntimeSchedule();
  if (!raw || typeof raw !== 'object') return base;
  const time = (value, fallback) => (/^\d{2}:\d{2}$/.test(String(value ?? '')) ? String(value) : fallback);
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort()
    : base.days;
  return {
    enabled: Boolean(raw.enabled),
    start: time(raw.start, base.start),
    end: time(raw.end, base.end),
    days: days.length ? days : base.days,
    timezone: String(raw.timezone || base.timezone).slice(0, 64),
  };
}

function defaultState() {
  return {
    version: STATE_VERSION,
    shelf: [],
    current: null,
    boundSessionId: null,
    boundSessionTitle: '',
    cookie: '',
    account: null,
    interactionSettings: defaultInteractionSettings(),
    runtimeSchedule: defaultRuntimeSchedule(),
  };
}

function normalizeShelfEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const bookId = String(entry.bookId ?? '');
  if (!/^\d{10,25}$/.test(bookId)) return null;
  return {
    bookId,
    title: String(entry.title ?? ''),
    author: String(entry.author ?? ''),
    cover: String(entry.cover ?? ''),
    intro: String(entry.intro ?? '').slice(0, 600),
    chapterCount: Number(entry.chapterCount ?? 0) || 0,
    chapterIndex: Number(entry.chapterIndex ?? 0) || 0,
    chapterTitle: String(entry.chapterTitle ?? ''),
    itemId: String(entry.itemId ?? ''),
    updatedAt: Number(entry.updatedAt ?? 0) || 0,
  };
}

function loadState() {
  const state = defaultState();
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (Array.isArray(raw.shelf)) {
      state.shelf = raw.shelf.map(normalizeShelfEntry).filter(Boolean);
    }
    if (raw.current && typeof raw.current === 'object') {
      const current = normalizeShelfEntry(raw.current);
      if (current) state.current = current;
    }
    if (typeof raw.boundSessionId === 'string' && raw.boundSessionId.trim()) {
      state.boundSessionId = raw.boundSessionId.trim();
      state.boundSessionTitle = String(raw.boundSessionTitle ?? '');
    }
    if (typeof raw.cookie === 'string') state.cookie = raw.cookie;
    if (raw.account && typeof raw.account === 'object') {
      state.account = {
        nickname: String(raw.account.nickname ?? '').slice(0, 80),
        avatar: String(raw.account.avatar ?? ''),
        userId: String(raw.account.userId ?? '').slice(0, 80),
      };
    }
    if (raw.interactionSettings && typeof raw.interactionSettings === 'object') {
      state.interactionSettings = normalizeInteractionSettings(raw.interactionSettings);
    }
    if (raw.runtimeSchedule && typeof raw.runtimeSchedule === 'object') {
      state.runtimeSchedule = normalizeRuntimeSchedule(raw.runtimeSchedule);
    }
  } catch {
    // 没有状态文件或文件损坏时使用空状态。
  }
  return state;
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const body = JSON.stringify(state, null, 2);
  const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.renameSync(tmp, STATE_FILE);
  } catch {
    fs.copyFileSync(tmp, STATE_FILE);
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
  if (process.platform !== 'win32') {
    try { fs.chmodSync(STATE_FILE, 0o600); } catch { /* ignore */ }
  }
}

function accountKey(state) {
  if (!state.cookie) return 'anon';
  return createHash('sha256').update(state.cookie).digest('hex').slice(0, 12);
}

function makeCache() {
  const map = new Map();
  return {
    async get(key, ttlMs, load) {
      const hit = map.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      const value = await load();
      map.set(key, { at: Date.now(), value });
      if (map.size > 240) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      return value;
    },
    clear() {
      map.clear();
    },
  };
}

function publicBook(book) {
  const { chapters, ...rest } = book;
  return rest;
}

function publicShelf(state) {
  return [...state.shelf].sort((a, b) => b.updatedAt - a.updatedAt);
}

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(new FanqieError('请求体过大', 'too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new FanqieError('请求 JSON 格式不正确', 'bad_json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
}

function textContent(text) {
  return [{ type: 'text', text }];
}

function renderSearch(value) {
  if (!value?.ok) return `搜索失败：${value?.error ?? '未知错误'}`;
  const results = value.results ?? [];
  if (results.length === 0) {
    return [
      '没有搜到匹配的书。',
      '番茄的站内搜索需要登录态，插件走的是网页索引，覆盖有限。',
      '请让用户直接粘贴 fanqienovel.com 的书籍链接或书籍 ID，再用 fanqie_book / fanqie_read 读取。',
    ].join('\n');
  }
  return [
    `找到 ${results.length} 本：`,
    ...results.map((item, index) => {
      const bits = [
        `书名：${item.title || '（未知）'}`,
        `bookId：${item.bookId}`,
        item.author ? `作者：${item.author}` : '',
        item.chapterCount ? `章节数：${item.chapterCount}` : '',
        item.intro ? `简介：${item.intro.slice(0, 180)}` : '',
      ].filter(Boolean);
      return `${index + 1}. ${item.title || item.bookId}\n   ${bits.join('\n   ')}`;
    }),
  ].join('\n\n');
}

function renderBook(value) {
  if (!value?.ok) return `读取书籍失败：${value?.error ?? '未知错误'}`;
  const book = value.book;
  return [
    `《${book.title}》`,
    `bookId：${book.bookId}`,
    book.author ? `作者：${book.author}` : '',
    book.tags?.length ? `标签：${book.tags.join(' / ')}` : '',
    book.chapterCount ? `章节数：${book.chapterCount}` : '',
    book.wordCount ? `字数：${book.wordCount}` : '',
    book.lastChapterTitle ? `最新章节：${book.lastChapterTitle}` : '',
    book.intro ? `简介：${book.intro}` : '',
  ].filter(Boolean).join('\n');
}

function renderToc(value) {
  if (!value?.ok) return `读取目录失败：${value?.error ?? '未知错误'}`;
  const chapters = value.chapters ?? [];
  return [
    `《${value.book?.title ?? ''}》共 ${value.total ?? chapters.length} 章：`,
    ...chapters.map((chapter) => {
      const lock = chapter.locked ? '（网页试读/锁定）' : '';
      const title = chapter.title || `第 ${chapter.index} 章`;
      return `${chapter.index}. ${title}${lock}`;
    }),
  ].join('\n');
}

function renderRead(value) {
  if (!value?.ok) return `读取章节失败：${value?.error ?? '未知错误'}`;
  const { book, chapter, progress } = value;
  const lockNotice = chapter.locked
    ? '\n注意：番茄网页只返回了这一章的试读内容（locked=true）。不要把试读内容当作完整章节，也不要编造后续。'
    : '';
  const truncated = value.truncated
    ? `\n\n（正文过长，已截取前 ${READ_LIMIT} 字；完整正文可用阅读器查看。）`
    : '';
  return [
    `《${book.title}》${chapter.title || `第 ${chapter.index} 章`}`,
    `bookId：${book.bookId}；itemId：${chapter.itemId}；章节序号：${chapter.index || '未知'}；当前进度：${progress?.chapterIndex ?? '未知'} / ${progress?.chapterCount ?? '未知'}`,
    lockNotice,
    '',
    value.content ?? '',
    truncated,
  ].filter(Boolean).join('\n');
}

function renderShelf(value) {
  if (!value?.ok) return `读取书架失败：${value?.error ?? '未知错误'}`;
  if (value.action === 'current') {
    if (!value.current) return '书架里还没有书。';
    const current = value.current;
    return [
      `当前：《${current.title || current.bookId}》${current.chapterTitle ? ` · ${current.chapterTitle}` : ''}`,
      `进度：第 ${current.chapterIndex || '?'} / ${current.chapterCount || '?'} 章`,
      `bookId：${current.bookId}`,
      current.itemId ? `itemId：${current.itemId}` : '',
    ].filter(Boolean).join('\n');
  }
  const shelf = value.shelf ?? [];
  if (shelf.length === 0) return '书架还是空的。';
  return [
    `书架里共有 ${shelf.length} 本：`,
    ...shelf.map((item, index) => {
      const progressText = item.chapterCount
        ? `第 ${item.chapterIndex || 0} / ${item.chapterCount} 章`
        : '还未开始';
      return `${index + 1}. 《${item.title || item.bookId}》 ${progressText}${item.author ? ` · ${item.author}` : ''}`;
    }),
  ].join('\n');
}

function renderComments(value) {
  if (!value?.ok) return `读取书评失败：${value?.error ?? '未知错误'}`;
  const comments = value.comments ?? [];
  if (comments.length === 0) return '这本书暂时没有读到书评。';
  return [
    `《${value.book?.title || value.bookId}》的最新书评（${comments.length} 条）：`,
    `自动发布：${value.autoPost ? '已开启（可直接发）' : '未开启（先给用户确认）'}；每天上限 ${value.dailyLimit ?? '?'} 条；最小间隔 ${value.minGapSeconds ?? '?'} 秒。`,
    ...comments.map((item, index) => [
      `${index + 1}. commentId=${item.commentId} · ${item.userName || '匿名'}${item.replyCount ? ` · ${item.replyCount} 条回复` : ''}`,
      item.text,
    ].join('\n')),
    '回复前先读内容；只在用户明确要求时调用 fanqie_reply 发布。',
  ].join('\n\n');
}


/**
 * Compile the compact parameter table used by the tool list into JSON Schema.
 *
 * `ctx.tools.register()` takes a ready-made JSON Schema for `parameters` (it
 * only validates `output.schema`). Passing the shorthand map
 * ({ book: { type: 'string', required: true } }) straight through makes the
 * model provider see a schema without a root `type`, which it reports as
 * `type: null` and rejects the whole request. `defineTool()` normally does this
 * compilation; this plugin registers raw definitions, so compile here.
 *
 * @param {Record<string, object>} spec per-property parameter definitions
 * @returns {{ type: 'object', properties: object, required?: string[] }}
 */
function compileParameters(spec) {
  const properties = {};
  const required = [];
  for (const [key, value] of Object.entries(spec ?? {})) {
    const { required: isRequired, ...schema } = value ?? {};
    properties[key] = schema;
    if (isRequired === true) required.push(key);
  }
  const compiled = { type: 'object', properties };
  if (required.length > 0) compiled.required = required;
  return compiled;
}

function toolDefinition(agent, tool) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: compileParameters(tool.parameters),
    output: {
      schema: tool.schema,
      render: tool.render,
    },
    async execute(args, exec) {
      if (exec.agent !== agent) {
        return { ok: false, error: '这个工具只对已绑定的共读会话开放。' };
      }
      try {
        return await tool.run(args ?? {}, exec.signal);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * @param {import('@deepseek-ai/dsh').Context} ctx
 */
export function apply(ctx) {
  const state = loadState();
  const cache = makeCache();
  /** @type {Map<object, () => void>} */
  const installed = new Map();
  /** @type {Map<string, ReturnType<typeof makeLoginSession>>} */
  const loginSessions = new Map();

  const persist = () => saveState(state);
  const fetchOptions = () => ({ cookie: state.cookie });

  // The Android app bridge reads the locally captured session. It never
  // creates accounts or bypasses login; it only speaks for the user's own
  // signed-in app session.
  let appBridge = null;
  function getAppBridge() {
    if (!appBridge) appBridge = createFanqieApp();
    return appBridge;
  }

  const hiddenBridge = createBridge({ getSchedule: () => state.runtimeSchedule });
  const setup = createSetup({ bridge: hiddenBridge });
  const capture = createCapture({ bridge: hiddenBridge });
  hiddenBridge.startScheduler();
  ctx.effect(() => () => hiddenBridge.dispose());

  const interaction = { day: '', count: 0, lastAt: 0 };
  function interactionSettings() {
    return normalizeInteractionSettings(state.interactionSettings);
  }
  function checkInteractionLimit() {
    const settings = interactionSettings();
    const day = new Date().toISOString().slice(0, 10);
    if (interaction.day !== day) {
      interaction.day = day;
      interaction.count = 0;
    }
    if (interaction.count >= settings.dailyLimit) {
      throw new FanqieError(`今天的自动评论/回复额度用完了（${settings.dailyLimit} 条/天），明天再来吧。`, 'rate_limited');
    }
    const gapMs = settings.minGapSeconds * 1000;
    if (Date.now() - interaction.lastAt < gapMs) {
      const wait = Math.ceil((gapMs - (Date.now() - interaction.lastAt)) / 1000);
      throw new FanqieError(`两条评论之间至少间隔 ${settings.minGapSeconds} 秒（还要等 ${wait} 秒），避免刷屏。`, 'too_fast');
    }
  }
  function noteInteraction() {
    interaction.count += 1;
    interaction.lastAt = Date.now();
  }

  const getBookCached = (bookId) =>
    cache.get(`book:${accountKey(state)}:${bookId}`, 30 * 60_000, () =>
      fetchBook(bookId, fetchOptions()),
    );

  const getTocCached = (bookId) =>
    cache.get(`toc:${accountKey(state)}:${bookId}`, 30 * 60_000, () =>
      fetchToc(bookId, fetchOptions()),
    );

  const getChapterCached = (itemId) =>
    cache.get(`chapter:${accountKey(state)}:${itemId}`, 2 * 60 * 60_000, () =>
      fetchChapter(itemId, fetchOptions()),
    );

  async function getBook(input, signal) {
    const text = String(input ?? '').trim();
    if (!text) throw new FanqieError('请提供书名、书籍链接或书籍 ID', 'missing_book');
    const ref = parseBookReference(text);
    if (ref?.kind === 'book') return getBookCached(ref.value);
    if (ref?.kind === 'id' || ref?.kind === 'item') {
      const resolved = await resolveBookId(text, { ...fetchOptions(), signal });
      return getBookCached(resolved.bookId);
    }
    const key = `search:${accountKey(state)}:${text}`;
    const results = await cache.get(key, 10 * 60_000, () =>
      searchBooks(text, { ...fetchOptions(), signal }),
    );
    if (results.length === 0) {
      throw new FanqieError(
        `没有搜到《${text}》。请直接粘贴 fanqienovel.com 的书籍链接或书籍 ID。`,
        'not_found',
      );
    }
    return getBookCached(results[0].bookId);
  }

  async function getToc(book, signal) {
    const bookInfo = typeof book === 'string' ? await getBook(book, signal) : book;
    const chapters = await getTocCached(bookInfo.bookId);
    if (chapters.some((chapter) => chapter.title)) return chapters;

    // 目录接口偶尔只给 allItemIds；用书籍页自带的标题补全。
    const detailed = bookInfo.chapters?.length ? bookInfo.chapters : [];
    if (detailed.length === chapters.length) {
      return chapters.map((chapter, index) => ({
        ...chapter,
        title: detailed[index]?.title || chapter.title,
        locked: chapter.locked || Boolean(detailed[index]?.locked),
      }));
    }
    return chapters;
  }

  function fillChapterTitles(chapters) {
    return chapters.map((chapter) => ({
      ...chapter,
      title: chapter.title || `第 ${chapter.index} 章`,
    }));
  }

  function upsertShelf(book, chapter) {
    const now = Date.now();
    const entry = {
      bookId: book.bookId,
      title: book.title,
      author: book.author,
      cover: book.cover,
      intro: (book.intro ?? '').slice(0, 600),
      chapterCount: book.chapterCount || 0,
      chapterIndex: chapter?.index || 0,
      chapterTitle: chapter?.title || '',
      itemId: chapter?.itemId || '',
      updatedAt: now,
    };
    const index = state.shelf.findIndex((item) => item.bookId === book.bookId);
    if (index >= 0) state.shelf[index] = { ...state.shelf[index], ...entry };
    else state.shelf.push(entry);
    state.current = entry;
    persist();
    return entry;
  }

  function addToShelf(book) {
    const existing = state.shelf.find((item) => item.bookId === book.bookId);
    if (existing) {
      existing.title = book.title || existing.title;
      existing.author = book.author || existing.author;
      existing.cover = book.cover || existing.cover;
      existing.intro = book.intro || existing.intro;
      existing.chapterCount = book.chapterCount || existing.chapterCount;
      existing.updatedAt = Date.now();
      persist();
      return existing;
    }
    const entry = {
      bookId: book.bookId,
      title: book.title,
      author: book.author,
      cover: book.cover,
      intro: (book.intro ?? '').slice(0, 600),
      chapterCount: book.chapterCount || 0,
      chapterIndex: 0,
      chapterTitle: '',
      itemId: '',
      updatedAt: Date.now(),
    };
    state.shelf.push(entry);
    persist();
    return entry;
  }

  function progressOf(bookId) {
    return state.shelf.find((item) => item.bookId === bookId) ?? null;
  }

  async function readTarget({ book, chapter }, signal) {
    const bookInfo = book ? await getBook(book, signal) : await currentBook(signal);
    const toc = fillChapterTitles(await getToc(bookInfo, signal));
    const progress = progressOf(bookInfo.bookId);

    let target;
    const chapterText = String(chapter ?? '').trim();
    if (/^\d{10,25}$/.test(chapterText)) {
      target = toc.find((item) => item.itemId === chapterText);
    } else if (/^\d+$/.test(chapterText)) {
      target = toc[Number(chapterText) - 1];
    } else if (chapterText === 'next' || chapterText === 'next_chapter') {
      const currentId = progress?.itemId || state.current?.itemId;
      const index = toc.findIndex((item) => item.itemId === currentId);
      target = toc[index + 1] ?? toc[0];
    } else if (chapterText === 'prev' || chapterText === 'previous' || chapterText === 'prev_chapter') {
      const currentId = progress?.itemId || state.current?.itemId;
      const index = toc.findIndex((item) => item.itemId === currentId);
      target = toc[Math.max(0, index - 1)] ?? toc[0];
    } else if (chapterText) {
      target = toc.find((item) => item.title.includes(chapterText));
    } else {
      const currentId = progress?.itemId || state.current?.itemId;
      target = toc.find((item) => item.itemId === currentId) ?? toc[0];
    }

    if (!target) {
      throw new FanqieError('没有找到这一章；请用 fanqie_toc 查看章节序号。', 'chapter_not_found');
    }
    const raw = await getChapterCached(target.itemId);
    const normalized = {
      ...raw,
      title: raw.title || target.title,
      index: raw.index || target.index,
    };
    const entry = upsertShelf(bookInfo, normalized);
    return {
      book: publicBook(bookInfo),
      chapter: normalized,
      progress: entry,
      toc,
    };
  }

  async function currentBook(signal) {
    if (state.current?.bookId) {
      try {
        return await getBookCached(state.current.bookId);
      } catch {
        // 落回书架中的第一本。
      }
    }
    const first = publicShelf(state)[0];
    if (first?.bookId) return getBookCached(first.bookId);
    throw new FanqieError('还没有打开任何书；请先搜索或粘贴书籍链接。', 'no_current_book');
  }

  async function boundInfo() {
    if (!state.boundSessionId) return null;
    const agent = ctx.agents.get(state.boundSessionId);
    return {
      sessionId: state.boundSessionId,
      title: state.boundSessionTitle || '共读会话',
      live: Boolean(agent),
      running: agent?.status === 'running',
      toolsInstalled: agent ? installed.has(agent) : false,
    };
  }

  async function sessionTitle(sessionId) {
    const query = ctx.get('sessionQuery');
    if (!query?.readTitle) return '';
    try {
      const snapshot = await query.readTitle(sessionId);
      return snapshot?.title || '';
    } catch {
      return '';
    }
  }

  async function listSessions() {
    const controller = ctx.get('sessionController');
    if (controller?.list) {
      const value = await controller.list({}, new AbortController().signal);
      const rows = (value?.items ?? []).filter(
        (row) => row.origin !== 'subagent' && row.sessionId,
      );
      const query = ctx.get('sessionQuery');
      const enriched = await Promise.all(
        rows.slice(0, 40).map(async (row) => {
          let title = '';
          if (query?.readTitle) {
            try {
              const snapshot = await query.readTitle(row.sessionId);
              title = snapshot?.title || '';
            } catch {
              // 标题只是展示信息，读不到不影响绑定。
            }
          }
          return {
            id: row.sessionId,
            title: title || (row.blank ? '新会话' : `会话 ${String(row.sessionId).slice(-8)}`),
            updatedAt: row.updatedAt ?? 0,
            running: Boolean(row.running),
            blank: Boolean(row.blank),
            bound: row.sessionId === state.boundSessionId,
          };
        }),
      );
      return enriched.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const query = ctx.get('sessionQuery');
    if (query?.listSessions) {
      const records = await query.listSessions();
      const rows = records.filter((record) => record.header.origin !== 'subagent');
      return rows.slice(0, 40).map((record) => ({
        id: record.header.id,
        title: `会话 ${String(record.header.id).slice(-8)}`,
        updatedAt: record.header.createdAt,
        running: false,
        blank: false,
        bound: record.header.id === state.boundSessionId,
      }));
    }
    return [];
  }

  async function createSession() {
    const controller = ctx.get('sessionController');
    if (!controller?.create) throw new FanqieError('当前 profile 没有会话服务，无法新建会话。', 'no_session_service');
    const created = await controller.create({});
    const sessionId = created?.sessionId;
    if (!sessionId) throw new FanqieError('新建会话失败。', 'create_session_failed');
    try {
      await controller.rename({ sessionId, title: '番茄共读' });
    } catch {
      // 重命名失败不影响绑定。
    }
    await bindSession(sessionId, '番茄共读', true);
    return { sessionId, title: '番茄共读' };
  }

  async function bindSession(sessionId, titleOverride = '', skipInspect = false) {
    const id = String(sessionId ?? '').trim();
    if (!id || id.length > 160) throw new FanqieError('会话 ID 不正确。', 'invalid_session');
    const controller = ctx.get('sessionController');
    if (!skipInspect && controller?.inspect) {
      try {
        await controller.inspect(id, new AbortController().signal);
      } catch {
        throw new FanqieError('找不到这个会话；请刷新会话列表后再选。', 'session_not_found');
      }
    }
    const title = titleOverride || (await sessionTitle(id)) || `会话 ${id.slice(-8)}`;
    state.boundSessionId = id;
    state.boundSessionTitle = title;
    persist();
    syncBinding();
    return boundInfo();
  }

  function unbindSession() {
    state.boundSessionId = null;
    state.boundSessionTitle = '';
    persist();
    syncBinding();
    return null;
  }

  function installForAgent(agent) {
    if (installed.has(agent)) return;
    if (!state.boundSessionId || agent.id !== state.boundSessionId) return;
    const cleanup = agent.ctx.effect(() => {
      const disposers = [];
      for (const tool of buildTools(agent)) {
        disposers.push(agent.ctx.tools.register(toolDefinition(agent, tool)));
      }
      let promptDispose;
      try {
        const prompts = agent.ctx.get('systemPrompt');
        promptDispose = prompts?.context({
          name: 'fanqie:reading',
          order: 140,
          text: () => readingContext(),
        });
      } catch {
        promptDispose = undefined;
      }
      return () => {
        if (promptDispose) promptDispose();
        for (const dispose of disposers.reverse()) dispose();
      };
    }, 'fanqie-reader.agent()');
    installed.set(agent, cleanup);
  }

  function uninstallAgent(agent) {
    const cleanup = installed.get(agent);
    installed.delete(agent);
    if (cleanup) {
      try { cleanup(); } catch { /* ignore */ }
    }
  }

  function syncBinding() {
    for (const agent of [...installed.keys()]) {
      if (agent.id !== state.boundSessionId) uninstallAgent(agent);
    }
    if (!state.boundSessionId) return;
    const live = ctx.agents.get(state.boundSessionId);
    if (live) installForAgent(live);
  }

  function readingContext() {
    const current = state.current;
    const shelf = publicShelf(state).slice(0, 6);
    return [
      '你正在「番茄书虫」的共读会话里。这个会话被用户指定为唯一的小说阅读会话。',
      current
        ? `用户正在读《${current.title || current.bookId}》${current.chapterTitle ? ` · ${current.chapterTitle}` : ''}（第 ${current.chapterIndex || '?'} / ${current.chapterCount || '?'} 章）。`
        : '用户还没有打开任何章节。',
      shelf.length
        ? `书架：${shelf.map((item) => `《${item.title || item.bookId}》`).join('、')}。`
        : '',
      '需要正文时调用 fanqie_read；需要目录时调用 fanqie_toc；不要凭印象编造没读到的情节。',
      '番茄网页对部分章节只返回试读（locked=true）；遇到这种情况要如实告诉用户，不要声称读完了整章。',
      '可使用 fanqie_search 搜书；如果搜不到，请让用户粘贴 fanqienovel.com 的书籍链接或 ID。',
      '如果用户明确要求发书评或回复书评，可用 fanqie_comments 先看内容；返回里有 autoPost（用户设置）。autoPost=true 时可直接用 fanqie_comment / fanqie_reply 发布；autoPost=false 时先给草稿并等用户确认。',
      '发布始终受用户设置的每日上限和最小间隔限制；这是用户自己的公开账号，绝不能刷屏或把同一句话复制到多条评论。',
    ].filter(Boolean).join('\n');
  }

  async function askCompanion(bookId, itemId) {
    const controller = ctx.get('sessionController');
    if (!controller?.prompt) throw new FanqieError('当前 profile 没有会话服务，无法发送共读请求。', 'no_session_service');
    if (!state.boundSessionId) {
      throw new FanqieError('还没有绑定共读会话。请先在番茄书虫侧栏选择或新建一个会话。', 'no_binding');
    }
    const book = await getBookCached(bookId);
    const toc = fillChapterTitles(await getTocCached(bookId));
    const target = toc.find((item) => item.itemId === itemId) || toc[0];
    if (!target) throw new FanqieError('这本书还没有章节。', 'chapter_not_found');
    const prompt = [
      `我们一起读《${book.title}》的${target.title || `第 ${target.index} 章`}吧。`,
      `请先调用 fanqie_read 读这一章（book="${book.bookId}"，chapter="${target.itemId}"），然后：`,
      '1. 用两三句话说说这一章发生了什么；',
      '2. 挑一个你最在意的细节或人物动机；',
      '3. 猜一个可能的伏笔；',
      '4. 问我一个问题。',
      '不要复述全文，也不要编造还没读到的后续。',
    ].join('\n');
    await controller.prompt({
      requestId: `fanqie-${randomUUID()}`,
      sessionId: state.boundSessionId,
      mode: 'queue',
      content: [{ type: 'text', text: prompt }],
    });
    return {
      sessionId: state.boundSessionId,
      title: state.boundSessionTitle || target.title || book.title,
      chapter: { itemId: target.itemId, title: target.title, index: target.index },
    };
  }

  function buildTools(agent) {
    return [
      {
        name: 'fanqie_search',
        description:
          '搜索番茄免费小说。可以传书名、作者、书籍 ID 或 fanqienovel.com 链接。站内搜索需要登录态，插件走网页索引，结果可能有限；没有结果时让用户粘贴书籍链接。',
        parameters: {
          query: { type: 'string', required: true, description: '书名、作者、书籍链接或 ID。' },
        },
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean' },
            query: { type: 'string' },
            results: { type: 'array', items: { type: 'object', additionalProperties: true } },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => textContent(renderSearch(value)),
        async run(args, signal) {
          const query = String(args.query ?? '').trim();
          if (!query) throw new FanqieError('query 不能为空。', 'invalid_argument');
          const key = `search:${accountKey(state)}:${query}`;
          const results = await cache.get(key, 10 * 60_000, () =>
            searchBooks(query, { ...fetchOptions(), signal }),
          );
          return { ok: true, query, results };
        },
      },
      {
        name: 'fanqie_book',
        description:
          '读取一本番茄小说的书籍信息（书名、作者、简介、标签、字数、章节数、最新章节）。book 可以是书名、书籍 ID 或 fanqienovel.com 链接。',
        parameters: {
          book: { type: 'string', required: true, description: '书名、书籍 ID 或番茄链接。' },
        },
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean' },
            book: { type: 'object', additionalProperties: true },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => textContent(renderBook(value)),
        async run(args, signal) {
          const book = await getBook(String(args.book ?? ''), signal);
          return { ok: true, book: publicBook(book) };
        },
      },
      {
        name: 'fanqie_toc',
        description:
          '读取番茄小说的章节目录。book 可以是书名、书籍 ID 或链接；不传 book 时用当前正在读的书。返回章节序号、itemId、标题、是否锁定。',
        parameters: {
          book: { type: 'string', description: '书名、书籍 ID 或番茄链接；省略则用当前书。' },
          offset: { type: 'number', description: '从第几章开始（1 开始），默认 1。' },
          limit: { type: 'number', description: '最多返回多少章，默认 80，最多 200。' },
        },
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean' },
            book: { type: 'object', additionalProperties: true },
            total: { type: 'number' },
            chapters: { type: 'array', items: { type: 'object', additionalProperties: true } },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => textContent(renderToc(value)),
        async run(args, signal) {
          const book = args.book
            ? await getBook(String(args.book), signal)
            : await currentBook(signal);
          const toc = fillChapterTitles(await getToc(book, signal));
          const offset = Math.max(1, Number(args.offset ?? 1) || 1);
          const limit = Math.min(200, Math.max(1, Number(args.limit ?? 80) || 80));
          const slice = toc.slice(offset - 1, offset - 1 + limit);
          return {
            ok: true,
            book: publicBook(book),
            total: toc.length,
            offset,
            chapters: summarizeChapters(slice, slice.length),
          };
        },
      },
      {
        name: 'fanqie_read',
        description:
          '读取番茄小说的一章正文，并保存阅读进度。chapter 可以是 1 开始的章节序号、章节 itemId，或 next / prev；不传则从当前进度继续。book 省略时用当前书。锁定章节只返回网页试读内容，结果里 locked=true。',
        parameters: {
          book: { type: 'string', description: '书名、书籍 ID 或番茄链接；省略则用当前书。' },
          chapter: { type: 'string', description: '章节序号、itemId、next 或 prev；省略则继续当前进度。' },
        },
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean' },
            book: { type: 'object', additionalProperties: true },
            chapter: { type: 'object', additionalProperties: true },
            content: { type: 'string' },
            progress: { type: 'object', additionalProperties: true },
            truncated: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => textContent(renderRead(value)),
        async run(args, signal) {
          const result = await readTarget(
            { book: args.book ? String(args.book) : '', chapter: args.chapter },
            signal,
          );
          const full = result.chapter.content ?? '';
          const truncated = full.length > READ_LIMIT;
          const content = truncated ? full.slice(0, READ_LIMIT) : full;
          return {
            ok: true,
            book: result.book,
            chapter: {
              itemId: result.chapter.itemId,
              title: result.chapter.title,
              index: result.chapter.index,
              locked: result.chapter.locked,
              preview: result.chapter.preview,
              wordCount: result.chapter.wordCount,
            },
            content,
            progress: result.progress,
            truncated,
          };
        },
      },
      {
        name: 'fanqie_comments',
        description:
          '读取一本番茄小说最新的书评（来自用户自己登录的番茄 App 账号）。返回 commentId、作者、正文和回复数。读取不会发任何内容。',
        parameters: {
          book: { type: 'string', description: '书名、书籍 ID 或番茄链接；省略则用当前书。' },
          count: { type: 'number', description: '最多读取多少条，默认 10，最多 20。' },
        },
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean' },
            book: { type: 'object', additionalProperties: true },
            bookId: { type: 'string' },
            comments: { type: 'array', items: { type: 'object', additionalProperties: true } },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => textContent(renderComments(value)),
        async run(args, signal) {
          const app = getAppBridge();
          if (!app) throw new FanqieError('还没有连接番茄 App 账号，请先在设置里同步登录。', 'no_app_auth');
          const book = args.book ? await getBook(String(args.book), signal) : await currentBook(signal);
          const count = Math.min(20, Math.max(1, Number(args.count ?? 10) || 10));
          const comments = await app.listComments(book.bookId, { count });
          return {
            ok: true,
            book: publicBook(book),
            bookId: book.bookId,
            comments,
            autoPost: interactionSettings().autoPost,
            dailyLimit: interactionSettings().dailyLimit,
            minGapSeconds: interactionSettings().minGapSeconds,
          };
        },
      },
      {
        name: 'fanqie_comment',
        description:
          '用用户自己的番茄 App 账号，在一本书下发布一条书评。这是写操作，会真实公开；只在用户明确要求发书评时调用。score 为 0-10（0 星到 5 星，默认 10）。不要连续刷评。',
        parameters: {
          book: { type: 'string', description: '书名、书籍 ID 或番茄链接；省略则用当前书。' },
          text: { type: 'string', required: true, description: '书评正文，1-2000 字。' },
          score: { type: 'number', description: '评分 0-10，默认 10（5 星）。' },
        },
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean' },
            book: { type: 'object', additionalProperties: true },
            commentId: { type: 'string' },
            text: { type: 'string' },
            score: { type: 'number' },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => textContent(
          value?.ok
            ? `已发书评（commentId=${value.commentId || '未知'}）：\n${value.text ?? ''}`
            : `发书评失败：${value?.error ?? '未知错误'}`,
        ),
        async run(args, signal) {
          const app = getAppBridge();
          if (!app) throw new FanqieError('还没有连接番茄 App 账号，请先在设置里同步登录。', 'no_app_auth');
          const book = args.book ? await getBook(String(args.book), signal) : await currentBook(signal);
          const text = String(args.text ?? '').trim();
          if (!text) throw new FanqieError('text 不能为空。', 'invalid_argument');
          checkInteractionLimit();
          const result = await app.addComment(book.bookId, text, Number(args.score ?? 10));
          noteInteraction();
          return { ok: true, book: publicBook(book), ...result };
        },
      },
      {
        name: 'fanqie_reply',
        description:
          '用用户自己的番茄 App 账号回复一条书评。commentId 来自 fanqie_comments。这是写操作，会真实公开；只在用户明确要求回复时调用，且不要把同一条内容复制到多条评论。',
        parameters: {
          book: { type: 'string', description: '书名、书籍 ID 或番茄链接；省略则用当前书。' },
          commentId: { type: 'string', required: true, description: '要回复的书评 commentId。' },
          text: { type: 'string', required: true, description: '回复正文，1-500 字。' },
        },
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean' },
            book: { type: 'object', additionalProperties: true },
            replyId: { type: 'string' },
            commentId: { type: 'string' },
            text: { type: 'string' },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => textContent(
          value?.ok
            ? `已回复（replyId=${value.replyId || '未知'}，评论=${value.commentId || '未知'}）：\n${value.text ?? ''}`
            : `回复失败：${value?.error ?? '未知错误'}`,
        ),
        async run(args, signal) {
          const app = getAppBridge();
          if (!app) throw new FanqieError('还没有连接番茄 App 账号，请先在设置里同步登录。', 'no_app_auth');
          const book = args.book ? await getBook(String(args.book), signal) : await currentBook(signal);
          const commentId = String(args.commentId ?? '').trim();
          if (!/^\d{10,25}$/.test(commentId)) throw new FanqieError('commentId 不正确。', 'invalid_argument');
          const text = String(args.text ?? '').trim();
          if (!text) throw new FanqieError('text 不能为空。', 'invalid_argument');
          checkInteractionLimit();
          const result = await app.reply(book.bookId, commentId, text);
          noteInteraction();
          return { ok: true, book: publicBook(book), ...result };
        },
      },
      {
        name: 'fanqie_shelf',
        description:
          '管理番茄书虫书架。action=list 查看书架；action=current 查看当前阅读进度；action=add 用 book 加书；action=remove 用 bookId 移除。',
        parameters: {
          action: {
            type: 'string',
            required: true,
            enum: ['list', 'current', 'add', 'remove'],
            description: 'list / current / add / remove。',
          },
          book: { type: 'string', description: 'add 时的书名、书籍 ID 或链接。' },
          bookId: { type: 'string', description: 'remove 时的书籍 ID。' },
        },
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            ok: { type: 'boolean' },
            action: { type: 'string' },
            shelf: { type: 'array', items: { type: 'object', additionalProperties: true } },
            current: { type: 'object', additionalProperties: true },
            error: { type: 'string' },
          },
        },
        render: (_args, value) => textContent(renderShelf(value)),
        async run(args, signal) {
          const action = String(args.action ?? 'list');
          if (action === 'list') {
            return { ok: true, action, shelf: publicShelf(state) };
          }
          if (action === 'current') {
            return {
              ok: true,
              action,
              current: state.current,
              shelf: publicShelf(state),
            };
          }
          if (action === 'add') {
            const book = await getBook(String(args.book ?? ''), signal);
            const entry = addToShelf(book);
            return { ok: true, action, shelf: publicShelf(state), current: entry };
          }
          if (action === 'remove') {
            const bookId = String(args.bookId ?? '').trim();
            if (!/^\d{10,25}$/.test(bookId)) throw new FanqieError('bookId 不正确。', 'invalid_argument');
            state.shelf = state.shelf.filter((item) => item.bookId !== bookId);
            if (state.current?.bookId === bookId) state.current = null;
            persist();
            return { ok: true, action, shelf: publicShelf(state) };
          }
          throw new FanqieError(`未知的 action：${action}`, 'invalid_argument');
        },
      },
    ];
  }

  ctx.effect(() => {
    const onCreate = ctx.on('agent/created', ({ agent }) => {
      if (agent.id === state.boundSessionId) installForAgent(agent);
    });
    const onDispose = ctx.on('agent/disposed', ({ agent }) => {
      installed.delete(agent);
    });
    for (const agent of ctx.agents.list()) {
      if (agent.id === state.boundSessionId) installForAgent(agent);
    }

    const disposeRoute = ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req, res) => {
        if (!isTrustedRequest(req)) {
          sendJson(res, 403, { ok: false, error: 'forbidden' });
          return;
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        try {
          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/state`) {
            const app = getAppBridge();
            sendJson(res, 200, {
              ok: true,
              shelf: publicShelf(state),
              current: state.current,
              bound: await boundInfo(),
              cookieSet: Boolean(state.cookie),
              account: state.account,
              interaction: app
                ? {
                  connected: true,
                  account: app.account,
                  dailyCount: interaction.count,
                  dailyLimit: interactionSettings().dailyLimit,
                  settings: interactionSettings(),
                }
                : { connected: false, settings: interactionSettings() },
              runtimeSchedule: state.runtimeSchedule,
            });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/interaction`) {
            const app = getAppBridge();
            sendJson(res, 200, {
              ok: true,
              connected: Boolean(app),
              account: app?.account ?? null,
              dailyCount: interaction.count,
              dailyLimit: interactionSettings().dailyLimit,
              settings: interactionSettings(),
            });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/interaction/settings`) {
            const body = await jsonBody(req);
            state.interactionSettings = normalizeInteractionSettings({
              ...interactionSettings(),
              dailyLimit: body.dailyLimit ?? interactionSettings().dailyLimit,
              minGapSeconds: body.minGapSeconds ?? interactionSettings().minGapSeconds,
              autoPost: body.autoPost ?? interactionSettings().autoPost,
            });
            persist();
            sendJson(res, 200, { ok: true, settings: interactionSettings() });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/runtime`) {
            sendJson(res, 200, { ok: true, schedule: state.runtimeSchedule });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/runtime/settings`) {
            const body = await jsonBody(req);
            state.runtimeSchedule = normalizeRuntimeSchedule({
              ...state.runtimeSchedule,
              enabled: body.enabled ?? state.runtimeSchedule.enabled,
              start: body.start ?? state.runtimeSchedule.start,
              end: body.end ?? state.runtimeSchedule.end,
              days: body.days ?? state.runtimeSchedule.days,
              timezone: body.timezone ?? state.runtimeSchedule.timezone,
            });
            persist();
            sendJson(res, 200, { ok: true, schedule: state.runtimeSchedule });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/bridge/status`) {
            sendJson(res, 200, { ok: true, ...(await hiddenBridge.status()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/bridge/start`) {
            hiddenBridge.setManual(true);
            sendJson(res, 200, { ok: true, ...(await hiddenBridge.start()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/bridge/stop`) {
            sendJson(res, 200, { ok: true, ...(await hiddenBridge.stop()) });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/bridge/screenshot`) {
            const png = await hiddenBridge.screenshot();
            res.writeHead(200, {
              'content-type': 'image/png',
              'cache-control': 'no-store',
              'content-length': png.length,
            });
            res.end(png);
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/setup/status`) {
            sendJson(res, 200, { ok: true, ...(await setup.status()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/setup/install-bluestacks`) {
            sendJson(res, 200, { ok: true, ...(await setup.installBlueStacks()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/setup/one-click`) {
            sendJson(res, 200, { ok: true, ...(await setup.oneClick()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/setup/install-apk`) {
            sendJson(res, 200, { ok: true, ...(await setup.installApk()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/setup/login`) {
            sendJson(res, 200, { ok: true, ...(await setup.launchVisible()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/setup/stop`) {
            sendJson(res, 200, { ok: true, ...(await setup.stopVisible()) });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/capture/status`) {
            sendJson(res, 200, { ok: true, ...(await capture.status()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/capture/start`) {
            sendJson(res, 200, { ok: true, ...(await capture.start()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/capture/stop`) {
            sendJson(res, 200, { ok: true, ...(await capture.stop()) });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/capture/import`) {
            const captureState = await capture.status();
            const result = importCapture(captureState.captureFile, { write: true });
            appBridge = null;
            sendJson(res, 200, { ok: true, ...result });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/interaction/comments`) {
            const app = getAppBridge();
            if (!app) throw new FanqieError('还没有连接番茄 App 账号。', 'no_app_auth');
            const bookId = String(url.searchParams.get('bookId') || state.current?.bookId || app.account.bookId || '').trim();
            if (!/^\d{10,25}$/.test(bookId)) throw new FanqieError('bookId 不正确。', 'invalid_argument');
            const count = Math.min(20, Math.max(1, Number(url.searchParams.get('count') ?? 10) || 10));
            const comments = await app.listComments(bookId, { count });
            sendJson(res, 200, { ok: true, bookId, comments });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/interaction/comment`) {
            const app = getAppBridge();
            if (!app) throw new FanqieError('还没有连接番茄 App 账号。', 'no_app_auth');
            const body = await jsonBody(req);
            const bookId = String(body.bookId || state.current?.bookId || app.account.bookId || '').trim();
            if (!/^\d{10,25}$/.test(bookId)) throw new FanqieError('bookId 不正确。', 'invalid_argument');
            const text = String(body.text ?? '').trim();
            if (!text) throw new FanqieError('书评内容不能为空。', 'invalid_argument');
            checkInteractionLimit();
            const result = await app.addComment(bookId, text, Number(body.score ?? 10));
            noteInteraction();
            sendJson(res, 200, { ok: true, bookId, ...result });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/interaction/reply`) {
            const app = getAppBridge();
            if (!app) throw new FanqieError('还没有连接番茄 App 账号。', 'no_app_auth');
            const body = await jsonBody(req);
            const bookId = String(body.bookId || state.current?.bookId || app.account.bookId || '').trim();
            const commentId = String(body.commentId ?? '').trim();
            if (!/^\d{10,25}$/.test(bookId) || !/^\d{10,25}$/.test(commentId)) {
              throw new FanqieError('bookId 或 commentId 不正确。', 'invalid_argument');
            }
            const text = String(body.text ?? '').trim();
            if (!text) throw new FanqieError('回复内容不能为空。', 'invalid_argument');
            checkInteractionLimit();
            const result = await app.reply(bookId, commentId, text);
            noteInteraction();
            sendJson(res, 200, { ok: true, bookId, ...result });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/login/start`) {
            for (const key of [...loginSessions.keys()]) {
              if (loginSessions.get(key).expiresAt <= Date.now()) loginSessions.delete(key);
            }
            const result = await startLogin();
            const session = makeLoginSession(result);
            loginSessions.set(session.id, session);
            sendJson(res, 200, { ok: true, ...publicLoginSession(session) });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/login/poll`) {
            const id = String(url.searchParams.get('token') ?? '').trim();
            const session = loginSessions.get(id);
            if (!session) {
              sendJson(res, 200, { ok: true, status: 'expired' });
              return;
            }
            const outcome = await pollLogin(session);
            if (outcome.status === 'success' && outcome.cookie) {
              state.cookie = outcome.cookie;
              state.account = outcome.account ?? null;
              persist();
              cache.clear();
              loginSessions.delete(id);
              sendJson(res, 200, {
                ok: true,
                status: 'success',
                account: state.account,
                cookieSet: true,
              });
              return;
            }
            if (outcome.status === 'expired' || outcome.status === 'error') {
              loginSessions.delete(id);
            }
            sendJson(res, 200, {
              ok: true,
              status: outcome.status,
              message: outcome.message ?? '',
            });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/account`) {
            if (state.cookie && !state.account) {
              state.account = await fetchAccount(state.cookie);
              if (state.account) persist();
            }
            sendJson(res, 200, {
              ok: true,
              loggedIn: Boolean(state.cookie),
              account: state.account,
              cookieSet: Boolean(state.cookie),
            });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/logout`) {
            state.cookie = '';
            state.account = null;
            loginSessions.clear();
            persist();
            cache.clear();
            sendJson(res, 200, { ok: true, loggedIn: false, account: null, cookieSet: false });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/search`) {
            const body = await jsonBody(req);
            const query = String(body.query ?? '').trim();
            if (!query) throw new FanqieError('搜索内容不能为空。', 'invalid_argument');
            const key = `search:${accountKey(state)}:${query}`;
            const results = await cache.get(key, 10 * 60_000, () =>
              searchBooks(query, fetchOptions()),
            );
            sendJson(res, 200, {
              ok: true,
              query,
              results,
              hint: results.length ? '' : '番茄站内搜索需要登录态；请直接粘贴 fanqienovel.com 的书籍链接或 ID。',
            });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/open`) {
            const body = await jsonBody(req);
            const book = await getBook(String(body.book ?? ''), undefined);
            const toc = fillChapterTitles(await getToc(book, undefined));
            const entry = addToShelf(book);
            sendJson(res, 200, {
              ok: true,
              book: publicBook(book),
              shelfEntry: entry,
              toc: {
                total: toc.length,
                chapters: toc,
              },
            });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/toc`) {
            const bookInput = String(url.searchParams.get('book') ?? '').trim();
            const book = bookInput ? await getBook(bookInput, undefined) : await currentBook(undefined);
            const toc = fillChapterTitles(await getToc(book, undefined));
            sendJson(res, 200, {
              ok: true,
              book: publicBook(book),
              total: toc.length,
              chapters: toc,
            });
            return;
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/chapter`) {
            const bookInput = String(url.searchParams.get('book') ?? '').trim();
            const itemId = String(url.searchParams.get('item') ?? '').trim();
            const index = String(url.searchParams.get('index') ?? '').trim();
            const chapter = itemId || index;
            const result = await readTarget(
              { book: bookInput || undefined, chapter },
              undefined,
            );
            sendJson(res, 200, {
              ok: true,
              book: result.book,
              chapter: result.chapter,
              progress: result.progress,
              toc: {
                total: result.toc.length,
                chapters: result.toc,
              },
            });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/progress`) {
            const body = await jsonBody(req);
            const book = await getBookCached(String(body.bookId ?? ''));
            const chapter = {
              itemId: String(body.itemId ?? ''),
              title: String(body.chapterTitle ?? ''),
              index: Number(body.chapterIndex ?? 0) || 0,
            };
            const entry = upsertShelf(book, chapter);
            sendJson(res, 200, { ok: true, progress: entry });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/shelf`) {
            const body = await jsonBody(req);
            const action = String(body.action ?? '');
            if (action === 'remove') {
              const bookId = String(body.bookId ?? '').trim();
              if (!/^\d{10,25}$/.test(bookId)) throw new FanqieError('bookId 不正确。', 'invalid_argument');
              state.shelf = state.shelf.filter((item) => item.bookId !== bookId);
              if (state.current?.bookId === bookId) state.current = null;
              persist();
              sendJson(res, 200, { ok: true, shelf: publicShelf(state) });
              return;
            }
            if (action === 'add') {
              const book = await getBook(String(body.book ?? ''), undefined);
              addToShelf(book);
              sendJson(res, 200, { ok: true, shelf: publicShelf(state) });
              return;
            }
            throw new FanqieError('未知的书架操作。', 'invalid_argument');
          }

          if (req.method === 'GET' && url.pathname === `${PREFIX}/api/sessions`) {
            const sessions = await listSessions();
            sendJson(res, 200, {
              ok: true,
              sessions,
              bound: await boundInfo(),
            });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/bind`) {
            const body = await jsonBody(req);
            const bound = await bindSession(String(body.sessionId ?? ''), String(body.title ?? ''));
            sendJson(res, 200, { ok: true, bound });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/unbind`) {
            sendJson(res, 200, { ok: true, bound: unbindSession() });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/sessions/create`) {
            const created = await createSession();
            sendJson(res, 200, { ok: true, created, bound: await boundInfo() });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/ask`) {
            const body = await jsonBody(req);
            const result = await askCompanion(
              String(body.bookId ?? ''),
              String(body.itemId ?? ''),
            );
            sendJson(res, 200, { ok: true, ...result });
            return;
          }

          if (req.method === 'POST' && url.pathname === `${PREFIX}/api/cookie`) {
            const body = await jsonBody(req);
            const cookie = String(body.cookie ?? '').trim();
            if (cookie.length > 8192 || /[\r\n]/.test(cookie)) {
              throw new FanqieError('Cookie 格式不正确。', 'invalid_cookie');
            }
            state.cookie = cookie;
            state.account = cookie ? await fetchAccount(cookie) : null;
            persist();
            cache.clear();
            sendJson(res, 200, {
              ok: true,
              cookieSet: Boolean(cookie),
              account: state.account,
            });
            return;
          }

          sendJson(res, 404, { ok: false, error: 'not found' });
        } catch (error) {
          const status = error instanceof FanqieError ? 400 : 500;
          sendJson(res, status, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });

    return () => {
      disposeRoute();
      onCreate();
      onDispose();
      loginSessions.clear();
      for (const agent of [...installed.keys()]) uninstallAgent(agent);
    };
  }, 'fanqie-reader.lifecycle()');
}
