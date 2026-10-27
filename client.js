/**
 * dsh-fanqie-reader — 浏览器半端。
 *
 * 注册左侧栏入口（sidebar.panellist）和主面板（main）。面板通过
 * /fanqie-reader/api/* 读取 Host 抓到的番茄内容；不直接跨域请求番茄。
 */

window.__ModuleLoader__.load({
  id: 'dsh-fanqie-reader',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;

    const PANEL_ID = 'fanqie-reader';
    const NS = 'fanqie-reader';
    const API = '/fanqie-reader/api';

    const DICTIONARY = {
      zh: {
        appTitle: '番茄书虫',
        appSubtitle: '番茄免费小说 · 共读模式',
        refresh: '刷新',
        settings: '设置',
        backToShelf: '返回书架',
        shelf: '书架',
        search: '搜索',
        sessions: '共读会话',
        chooseSession: '选择会话',
        changeSession: '更换',
        unbind: '解除绑定',
        newSession: '新建共读会话',
        refreshSessions: '刷新会话',
        boundNone: '未绑定共读会话',
        boundTo: '共读会话',
        boundHint: '绑定后，只有这个会话里的 DeepSeek 能看到 fanqie_* 共读工具。',
        sessionPickerHint:
          '选一个已有的 DSH 会话，或者新建一个。绑定后去那个会话里和 DeepSeek 聊小说；其他会话不会出现这些阅读工具。',
        sessionEmpty: '还没有可选会话。先新建一个吧。',
        sessionCurrent: '当前绑定',
        sessionRunning: '运行中',
        sessionBound: '已绑定共读会话',
        sessionUnbound: '已解除绑定',
        sessionCreated: '已新建并绑定「番茄共读」',
        searchPlaceholder: '书名 / 番茄链接 / 书籍 ID',
        searchButton: '搜索',
        searching: '正在搜索…',
        searchHint:
          '番茄站内搜索需要登录态，插件只能走网页索引；最稳的是直接粘贴 fanqienovel.com/page/... 的链接。',
        searchEmpty: '没有搜到。试试粘贴书籍链接或 ID。',
        searchResults: '搜索结果',
        open: '打开',
        addToShelf: '加入书架',
        shelfEmptyTitle: '书架还是空的',
        shelfEmptyBody:
          '在上方粘贴一本番茄小说的链接或 ID，或者搜索书名。打开后会自动加入书架。',
        continueReading: '继续读',
        startReading: '开始读',
        removeBook: '移除',
        removeConfirm: '把这本书从书架移除？阅读进度也会一起移除。',
        readProgress: '读到 {chapter}',
        notStarted: '还没开始',
        chapterProgress: '第 {index} / {total} 章',
        aiRead: 'AI 共读这一章',
        aiReadHint: '会向绑定的共读会话发送一条消息，消耗该会话的 token。',
        aiNeedBinding: '先绑定一个共读会话，再让 AI 共读。',
        aiSent: '已发到共读会话，去那里和 DeepSeek 聊吧',
        aiSending: '正在发送…',
        prevChapter: '上一章',
        nextChapter: '下一章',
        chapterList: '目录',
        tocEmpty: '这本书还没有目录。',
        tocLocked: '试读',
        lockedTitle: '这一章网页端只返回了试读',
        lockedBody:
          '番茄网页对未登录/非 SVIP 读者可能只给部分正文。插件不会绕过限制；你可以设置自己的 Cookie 后重试。',
        settingsTitle: '阅读设置',
        accountTitle: '番茄账号',
        accountHint:
          '用番茄 App 或抖音 App 扫码登录。Cookie 只保存在本机，不返回给前端；登录后才能读取账号有权限的章节。',
        socialNote:
          '已接通 App 账号的书评/回复：只使用你本机登录的番茄账号；每天上限和间隔可以在下面自己调。',
        accountLoggedIn: '已登录',
        accountLoggedOut: '未登录',
        qrLogin: '扫码登录',
        qrWaiting: '等待扫码…',
        qrScanned: '已扫码，请在手机上确认',
        qrConfirmed: '已确认，正在完成登录…',
        qrExpired: '二维码已过期，请重新获取',
        qrHintDefault: '请使用已登录番茄/抖音账号的手机 App 扫码',
        qrImageAlt: '番茄登录二维码',
        cancel: '取消',
        logout: '退出登录',
        logoutDone: '已退出登录',
        accountNicknameFallback: '番茄账号',
        loginFailed: '登录失败',
        interactionTitle: '评论与回复',
        interactionHint:
          '使用你已登录的番茄 App 账号发书评/回复；每天上限和最小间隔可以自己调。开启「AI 直接发布」后 AI 不再逐条确认。',
        interactionConnected: '已连接番茄 App 账号',
        interactionDisconnected: '还没有同步番茄 App 登录；先在模拟器里登录后，本鱼会本地保存这份会话。',
        interactionCommentLabel: '写书评',
        interactionCommentPlaceholder: '写点真实的阅读感受，别刷屏…',
        interactionScoreLabel: '评分',
        interactionPostComment: '发布书评',
        interactionReplyIdLabel: '要回复的书评 ID',
        interactionReplyIdPlaceholder: '从书评工具的结果里复制 commentId',
        interactionReplyLabel: '回复内容',
        interactionReplyPlaceholder: '认真回复这一条书评…',
        interactionPostReply: '发布回复',
        interactionPosted: '书评已发布',
        interactionReplied: '回复已发布',
        interactionDaily: '今日已发',
        interactionRefresh: '刷新书评',
        interactionCommentsTitle: '最新书评',
        interactionNoComments: '暂时没读到书评。',
        interactionLoadComments: '读取当前书的书评',
        interactionSelectComment: '点一条书评，自动填入回复 ID',
        interactionNeedBook: '先在书架里打开一本书。',
        interactionSettingsTitle: '自动互动设置',
        interactionAutoPost: 'AI 直接发布',
        interactionAutoPostHint: '开启后 AI 不再逐条确认；仍受每天上限和最小间隔限制。',
        interactionDailyLimit: '每天最多',
        interactionMinGap: '最小间隔（秒）',
        interactionSaveSettings: '保存互动设置',
        interactionSettingsSaved: '互动设置已保存',
        interactionLimitUnit: '条',
        interactionGapUnit: '秒',
        runtimeTitle: '运行时间',
        runtimeHint:
          '默认按 DeepSeek 谷时（北京时间 00:30–08:30）运行：到点自动启动，结束后自动关闭；不在时段内不占资源。',
        runtimeEnable: '按时间运行',
        runtimeStart: '开始',
        runtimeEnd: '结束',
        runtimeDays: '运行日',
        runtimeEveryday: '每天',
        runtimeSave: '保存运行时间',
        runtimeSaved: '运行时间已保存',
        runtimeManual: '立即运行一次',
        runtimeManualHint: '手动运行会临时覆盖时间表，执行完仍按时间表关闭。',
        bridgeStatus: '隐藏桥状态',
        bridgeRunning: '运行中',
        bridgeStopped: '已停止',
        bridgeStarting: '正在启动…',
        bridgeNotInstalled: '未安装 BlueStacks 高级互动组件',
        bridgeStart: '立即启动',
        bridgeStop: '停止',
        bridgeRefresh: '刷新状态',
        bridgeError: '隐藏桥错误',
        setupTitle: '高级组件安装',
        setupHint: '一次点击 + 一次 Windows 管理员授权 + 一次可见登录。安装 BlueStacks 和番茄 APK；首次登录不隐藏。',
        setupOneClick: '一键安装高级组件',
        setupApkInstall: '只安装番茄 APK',
        setupLogin: '打开可见登录',
        setupStop: '关闭 BlueStacks',
        setupRefresh: '刷新状态',
        setupReady: '高级组件已就绪',
        setupMissing: 'BlueStacks / APK 未就绪',
        setupApkMissing: '缺少 fanqie.apk',
        setupLog: '安装日志',
        setupBusy: '正在安装，请勿关闭 DSH…',
        setupNeedsLogin: '请在 BlueStacks 里登录番茄 App',
        captureTitle: '稳定互动捕获',
        captureHint:
          '稳定发书评/回复需要一次高级捕获：本机 BlueStacks root + mitmproxy 系统证书。只记录番茄相关域名，只保存在本机，不上传。',
        captureStart: '开始高级捕获',
        captureStop: '停止并保存',
        captureRefresh: '刷新捕获状态',
        captureActive: '捕获中，请打开番茄 App 的书评页',
        captureInactive: '未在捕获',
        captureRootMissing: 'BlueStacks 没有 root',
        captureCaMissing: '没有安装 mitmproxy 系统证书',
        captureAuthReady: '已检测到 App 会话',
        captureAuthMissing: '还没有 App 会话',
        captureConsent: '这会改变 BlueStacks 的证书/网络设置，不是静默操作。',
        captureImport: '保存捕获会话',
        captureImported: 'App 会话已保存',
        cookieTitle: '番茄 Cookie（可选）',
        cookieHint:
          '只保存在本机 $DSH_HOME/fanqie-reader/state.json，只发送给 fanqienovel.com。设置后可能读到更多已购/有权限的章节；留空则清除。',
        cookiePlaceholder: '粘贴浏览器里 fanqienovel.com 的 Cookie',
        saveCookie: '保存 Cookie',
        clearCookie: '清除',
        cookieSet: '已设置 Cookie',
        cookieUnset: '未设置 Cookie',
        cookieSaved: 'Cookie 已保存',
        cookieCleared: 'Cookie 已清除',
        loading: '正在加载…',
        loadStateFailed: '加载番茄书虫状态失败',
        retry: '重试',
        error: '出错了',
        close: '关闭',
        words: '字',
        completed: '已完结',
        serializing: '连载中',
        noCover: '番茄',
        opening: '正在打开…',
        chapterLoading: '正在读取章节…',
        backToSessions: '返回会话列表',
        sessionIdLabel: '会话 ID',
        bindThis: '绑定此会话',
        currentBook: '当前在读',
        apiOffline: '插件后端没有响应，请确认已重启 DSH。',
      },
      en: {
        appTitle: 'Fanqie Reader',
        appSubtitle: 'Fanqie novels · reading companion',
        refresh: 'Refresh',
        settings: 'Settings',
        backToShelf: 'Back to shelf',
        shelf: 'Shelf',
        search: 'Search',
        sessions: 'Companion session',
        chooseSession: 'Choose session',
        changeSession: 'Change',
        unbind: 'Unbind',
        newSession: 'New companion session',
        refreshSessions: 'Refresh sessions',
        boundNone: 'No companion session bound',
        boundTo: 'Companion session',
        boundHint:
          'Only the bound session can see the fanqie_* reading tools.',
        sessionPickerHint:
          'Pick an existing DSH session or create one. After binding, chat with DeepSeek there; other sessions will not expose the reading tools.',
        sessionEmpty: 'No sessions yet. Create one first.',
        sessionCurrent: 'Bound',
        sessionRunning: 'Running',
        sessionBound: 'Companion session bound',
        sessionUnbound: 'Companion session unbound',
        sessionCreated: 'Created and bound "Fanqie Reading"',
        searchPlaceholder: 'Title / Fanqie link / book ID',
        searchButton: 'Search',
        searching: 'Searching…',
        searchHint:
          'Fanqie site search needs a login; this plugin uses a web index. Pasting a fanqienovel.com/page/... link is the most reliable.',
        searchEmpty: 'Nothing found. Try pasting the book link or ID.',
        searchResults: 'Search results',
        open: 'Open',
        addToShelf: 'Add to shelf',
        shelfEmptyTitle: 'Your shelf is empty',
        shelfEmptyBody:
          'Paste a Fanqie novel link or ID above, or search by title. Opened books are added to the shelf automatically.',
        continueReading: 'Continue',
        startReading: 'Start',
        removeBook: 'Remove',
        removeConfirm: 'Remove this book and its reading progress?',
        readProgress: 'At {chapter}',
        notStarted: 'Not started',
        chapterProgress: 'Chapter {index} / {total}',
        aiRead: 'Read with AI',
        aiReadHint:
          'Sends one message to the bound session; it consumes that session’s tokens.',
        aiNeedBinding: 'Bind a companion session before asking AI to read.',
        aiSent: 'Sent to the companion session',
        aiSending: 'Sending…',
        prevChapter: 'Previous',
        nextChapter: 'Next',
        chapterList: 'Contents',
        tocEmpty: 'No chapter list yet.',
        tocLocked: 'Preview',
        lockedTitle: 'Only a preview is available',
        lockedBody:
          'Fanqie may return only part of the chapter for signed-out/non-SVIP readers. This plugin does not bypass that; you can set your own cookie and retry.',
        settingsTitle: 'Reader settings',
        accountTitle: 'Fanqie account',
        accountHint:
          'Scan with the Fanqie or Douyin app. The cookie stays on this machine and is never returned to the browser.',
        socialNote:
          'Fanqie app reviews/replies use your locally signed-in account. Daily cap and minimum gap are configurable below.',
        accountLoggedIn: 'Signed in',
        accountLoggedOut: 'Not signed in',
        qrLogin: 'Scan to sign in',
        qrWaiting: 'Waiting for scan…',
        qrScanned: 'Scanned — confirm on your phone',
        qrConfirmed: 'Confirmed — finishing sign-in…',
        qrExpired: 'The QR code expired. Try again.',
        qrHintDefault: 'Scan with a signed-in Fanqie or Douyin mobile app',
        qrImageAlt: 'Fanqie sign-in QR code',
        cancel: 'Cancel',
        logout: 'Sign out',
        logoutDone: 'Signed out',
        accountNicknameFallback: 'Fanqie account',
        loginFailed: 'Sign-in failed',
        interactionTitle: 'Comments & replies',
        interactionHint:
          'Posts with your signed-in Fanqie app account. Daily cap and minimum gap are configurable below.',
        interactionConnected: 'Fanqie app account connected',
        interactionDisconnected: 'No app session yet. Sign in in the emulator; the local bridge will pick it up.',
        interactionCommentLabel: 'Write a review',
        interactionCommentPlaceholder: 'A genuine reading thought, not spam…',
        interactionScoreLabel: 'Rating',
        interactionPostComment: 'Post review',
        interactionReplyIdLabel: 'Review ID to reply to',
        interactionReplyIdPlaceholder: 'Copy a commentId from the comments tool result',
        interactionReplyLabel: 'Reply',
        interactionReplyPlaceholder: 'Reply to this review…',
        interactionPostReply: 'Post reply',
        interactionPosted: 'Review posted',
        interactionReplied: 'Reply posted',
        interactionDaily: 'Posted today',
        interactionRefresh: 'Refresh comments',
        interactionCommentsTitle: 'Latest reviews',
        interactionNoComments: 'No reviews loaded yet.',
        interactionLoadComments: 'Load reviews for this book',
        interactionSelectComment: 'Tap a review to fill its reply ID',
        interactionNeedBook: 'Open a book from the shelf first.',
        interactionSettingsTitle: 'Auto-interaction settings',
        interactionAutoPost: 'Let AI post directly',
        interactionAutoPostHint:
          'When on, AI no longer asks before each post. Daily limit and minimum gap still apply.',
        interactionDailyLimit: 'Per day',
        interactionMinGap: 'Min gap (seconds)',
        interactionSaveSettings: 'Save interaction settings',
        interactionSettingsSaved: 'Interaction settings saved',
        interactionLimitUnit: 'posts',
        interactionGapUnit: 's',
        runtimeTitle: 'Runtime schedule',
        runtimeHint:
          'Defaults to DeepSeek off-peak (00:30–08:30 Asia/Shanghai): starts automatically at the window and shuts down after it.',
        runtimeEnable: 'Run on schedule',
        runtimeStart: 'From',
        runtimeEnd: 'To',
        runtimeDays: 'Days',
        runtimeEveryday: 'Every day',
        runtimeSave: 'Save runtime schedule',
        runtimeSaved: 'Runtime schedule saved',
        runtimeManual: 'Run once now',
        runtimeManualHint: 'A manual run temporarily overrides the schedule, then shuts down again.',
        bridgeStatus: 'Hidden bridge',
        bridgeRunning: 'Running',
        bridgeStopped: 'Stopped',
        bridgeStarting: 'Starting…',
        bridgeNotInstalled: 'BlueStacks advanced component is not installed',
        bridgeStart: 'Start now',
        bridgeStop: 'Stop',
        bridgeRefresh: 'Refresh status',
        bridgeError: 'Bridge error',
        setupTitle: 'Advanced setup',
        setupHint: 'One click + one Windows UAC + one visible login. Installs BlueStacks and the Fanqie APK; first login stays visible.',
        setupOneClick: 'Install advanced component',
        setupApkInstall: 'Install APK only',
        setupLogin: 'Open visible login',
        setupStop: 'Close BlueStacks',
        setupRefresh: 'Refresh',
        setupReady: 'Advanced component ready',
        setupMissing: 'BlueStacks / APK not ready',
        setupApkMissing: 'fanqie.apk missing',
        setupLog: 'Setup log',
        setupBusy: 'Installing, keep DSH open…',
        setupNeedsLogin: 'Sign in to Fanqie in BlueStacks',
        captureTitle: 'Stable interaction capture',
        captureHint:
          'Stable reviews/replies need one explicit advanced capture: BlueStacks root + mitmproxy system certificate. Only Fanqie hosts are recorded locally and never uploaded.',
        captureStart: 'Start advanced capture',
        captureStop: 'Stop and save',
        captureRefresh: 'Refresh capture status',
        captureActive: 'Capturing; open a Fanqie review page',
        captureInactive: 'Not capturing',
        captureRootMissing: 'BlueStacks is not rooted',
        captureCaMissing: 'mitmproxy system certificate is missing',
        captureAuthReady: 'App session detected',
        captureAuthMissing: 'No App session yet',
        captureConsent: 'This changes BlueStacks certificate/network settings; it is not silent.',
        captureImport: 'Save captured session',
        captureImported: 'App session saved',
        cookieTitle: 'Fanqie cookie (optional)',
        cookieHint:
          'Stored only on this machine at $DSH_HOME/fanqie-reader/state.json and sent only to fanqienovel.com. It may unlock chapters your account can access. Leave empty to clear.',
        cookiePlaceholder: 'Paste the fanqienovel.com cookie from your browser',
        saveCookie: 'Save cookie',
        clearCookie: 'Clear',
        cookieSet: 'Cookie set',
        cookieUnset: 'No cookie',
        cookieSaved: 'Cookie saved',
        cookieCleared: 'Cookie cleared',
        loading: 'Loading…',
        loadStateFailed: 'Could not load Fanqie Reader state',
        retry: 'Retry',
        error: 'Something went wrong',
        close: 'Close',
        words: 'words',
        completed: 'Completed',
        serializing: 'Ongoing',
        noCover: 'Fanqie',
        opening: 'Opening…',
        chapterLoading: 'Reading chapter…',
        backToSessions: 'Back to sessions',
        sessionIdLabel: 'Session ID',
        bindThis: 'Bind this session',
        currentBook: 'Now reading',
        apiOffline: 'The plugin backend is not responding; restart DSH.',
      },
    };

    let t = (key) => key;

    function format(key, vars) {
      let text = t(key);
      for (const [name, value] of Object.entries(vars ?? {})) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
      return text;
    }

    async function api(path, options = {}) {
      const init = {
        method: options.method ?? 'GET',
        headers: {},
      };
      if (options.body !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }
      const response = await fetch(`${API}${path}`, init);
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(t('apiOffline'));
      }
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      return payload;
    }

    function Icon({ size = 18 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': 'true',
        },
        h('path', {
          d: 'M12 4.6c4.2 0 7.2 3 7.2 6.9 0 4.4-3 7.5-7.2 7.5S4.8 15.9 4.8 11.5c0-3.9 3-6.9 7.2-6.9Z',
          fill: 'currentColor',
          opacity: '0.9',
        }),
        h('path', {
          d: 'M12 4.9c-.8-1.7-2.4-2.4-4.3-2.2.7 1.4 1.8 2.2 3.2 2.6M12 4.9c.8-1.7 2.4-2.4 4.3-2.2-.7 1.4-1.8 2.2-3.2 2.6',
          stroke: 'currentColor',
          strokeWidth: '1.7',
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M9 11.2c.8-.5 1.8-.7 3-.7s2.2.2 3 .7M9 14c.8-.3 1.8-.5 3-.5s2.2.2 3 .5',
          stroke: 'var(--dsw-alias-bg-base)',
          strokeWidth: '1.5',
          strokeLinecap: 'round',
        }),
      );
    }

    function Cover({ book, className = '' }) {
      const style = book?.cover
        ? { backgroundImage: `url("${book.cover}")` }
        : undefined;
      return h(
        'div',
        { className: `fr-cover ${className}`.trim(), style },
        !book?.cover ? h('span', null, t('noCover')) : null,
      );
    }

    function ErrorBanner({ message, onClose }) {
      if (!message) return null;
      return h(
        'div',
        { className: 'fr-error', role: 'alert' },
        h('span', null, message),
        h(
          'button',
          { type: 'button', className: 'fr-icon-btn', onClick: onClose, 'aria-label': t('close') },
          '×',
        ),
      );
    }

    function FanqieReaderPanel() {
      const [data, setData] = useState(null);
      const [view, setView] = useState('shelf');
      const [busy, setBusy] = useState('');
      const [error, setError] = useState('');
      const [query, setQuery] = useState('');
      const [results, setResults] = useState([]);
      const [searchHint, setSearchHint] = useState('');
      const [book, setBook] = useState(null);
      const [toc, setToc] = useState([]);
      const [chapter, setChapter] = useState(null);
      const [showToc, setShowToc] = useState(false);
      const [sessions, setSessions] = useState([]);
      const [cookieInput, setCookieInput] = useState('');
      const [login, setLogin] = useState(null);
      const [interaction, setInteraction] = useState(null);
      const [interactionSettings, setInteractionSettings] = useState({ dailyLimit: 10, minGapSeconds: 20, autoPost: false });
      const [runtimeSchedule, setRuntimeSchedule] = useState({
        enabled: true,
        start: '00:30',
        end: '08:30',
        days: [1, 2, 3, 4, 5, 6, 7],
        timezone: 'Asia/Shanghai',
      });
      const [bridgeStatus, setBridgeStatus] = useState(null);
      const [setupStatus, setSetupStatus] = useState(null);
      const [captureStatus, setCaptureStatus] = useState(null);
      const [commentText, setCommentText] = useState('');
      const [commentScore, setCommentScore] = useState(10);
      const [replyId, setReplyId] = useState('');
      const [replyText, setReplyText] = useState('');
      const [latestComments, setLatestComments] = useState([]);
      const [toast, setToast] = useState('');
      const toastTimer = useRef(0);

      const bound = data?.bound ?? null;

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const payload = await api('/state');
            if (alive) {
              setData(payload);
              setInteraction(payload.interaction ?? null);
              if (payload.interaction?.settings) setInteractionSettings(payload.interaction.settings);
              if (payload.runtimeSchedule) setRuntimeSchedule(payload.runtimeSchedule);
              try {
                const bridge = await api('/bridge/status');
                if (alive) setBridgeStatus(bridge);
              } catch { /* bridge is optional */ }
              try {
                const setup = await api('/setup/status');
                if (alive) setSetupStatus(setup);
              } catch { /* setup is optional */ }
              try {
                const capture = await api('/capture/status');
                if (alive) setCaptureStatus(capture);
              } catch { /* capture is optional */ }
            }
          } catch (err) {
            if (alive) setError(err instanceof Error ? err.message : String(err));
          }
        })();
        return () => {
          alive = false;
        };
      }, []);

      useEffect(() => {
        if (!toast) return undefined;
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(''), 4200);
        return () => window.clearTimeout(toastTimer.current);
      }, [toast]);

      useEffect(() => {
        if (!showToc) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') setShowToc(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [showToc]);

      useEffect(() => {
        const loginToken = login?.loginToken;
        if (!loginToken) return undefined;
        let stopped = false;
        let timer = 0;
        const poll = async () => {
          try {
            const payload = await api(`/login/poll?token=${encodeURIComponent(loginToken)}`);
            if (stopped) return;
            if (payload.status === 'success') {
              stopped = true;
              window.clearInterval(timer);
              setData((current) => ({
                ...(current ?? {}),
                account: payload.account,
                cookieSet: true,
              }));
              setLogin(null);
              setToast(t('accountLoggedIn'));
              return;
            }
            if (payload.status === 'expired' || payload.status === 'error') {
              stopped = true;
              window.clearInterval(timer);
              setLogin((current) => ({
                ...(current ?? {}),
                status: payload.status,
                message: payload.message || '',
              }));
              return;
            }
            setLogin((current) => ({
              ...(current ?? {}),
              status: payload.status,
            }));
          } catch (err) {
            if (stopped) return;
            stopped = true;
            window.clearInterval(timer);
            setLogin((current) => ({
              ...(current ?? {}),
              status: 'error',
              message: err instanceof Error ? err.message : String(err),
            }));
          }
        };
        timer = window.setInterval(poll, 2000);
        poll();
        return () => {
          stopped = true;
          window.clearInterval(timer);
        };
      }, [login?.loginToken]);

      async function refreshState() {
        try {
          const payload = await api('/state');
          setData(payload);
          return payload;
        } catch {
          return data;
        }
      }

      function interactionBookId() {
        return data?.current?.bookId || book?.bookId || '';
      }

      async function refreshInteraction() {
        try {
          const payload = await api('/interaction');
          setInteraction(payload);
          if (payload.settings) setInteractionSettings(payload.settings);
          return payload;
        } catch (err) {
          setInteraction({ ok: false, connected: false, error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      }

      async function saveInteractionSettings() {
        await run('interaction-settings', async () => {
          const payload = await api('/interaction/settings', {
            method: 'POST',
            body: {
              dailyLimit: Number(interactionSettings.dailyLimit) || 10,
              minGapSeconds: Number(interactionSettings.minGapSeconds) || 20,
              autoPost: Boolean(interactionSettings.autoPost),
            },
          });
          if (payload.settings) setInteractionSettings(payload.settings);
          setToast(t('interactionSettingsSaved'));
          await refreshInteraction();
        });
      }

      async function saveRuntimeSchedule() {
        await run('runtime-settings', async () => {
          const payload = await api('/runtime/settings', {
            method: 'POST',
            body: runtimeSchedule,
          });
          if (payload.schedule) setRuntimeSchedule(payload.schedule);
          setToast(t('runtimeSaved'));
        });
      }

      async function refreshBridge() {
        try {
          const payload = await api('/bridge/status');
          setBridgeStatus(payload);
          return payload;
        } catch (err) {
          setBridgeStatus({ installed: false, error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      }

      async function startBridge() {
        await run('bridge-start', async () => {
          const payload = await api('/bridge/start', { method: 'POST', body: {} });
          setBridgeStatus(payload);
          setToast(payload.running ? t('bridgeRunning') : (payload.error || t('bridgeStopped')));
        });
      }

      async function stopBridge() {
        await run('bridge-stop', async () => {
          const payload = await api('/bridge/stop', { method: 'POST', body: {} });
          setBridgeStatus(payload);
          setToast(t('bridgeStopped'));
        });
      }

      async function refreshSetup() {
        try {
          const payload = await api('/setup/status');
          setSetupStatus(payload);
          return payload;
        } catch (err) {
          setSetupStatus({ installed: false, error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      }

      async function setupOneClick() {
        await run('setup-one-click', async () => {
          const payload = await api('/setup/one-click', { method: 'POST', body: {} });
          setSetupStatus(payload);
          if (payload.error) throw new Error(payload.error);
          setToast(t('setupNeedsLogin'));
          await refreshBridge();
        });
      }

      async function setupInstallApk() {
        await run('setup-apk', async () => {
          const payload = await api('/setup/install-apk', { method: 'POST', body: {} });
          setSetupStatus(payload);
          if (payload.error) throw new Error(payload.error);
          setToast(t('setupReady'));
        });
      }

      async function setupLogin() {
        await run('setup-login', async () => {
          const payload = await api('/setup/login', { method: 'POST', body: {} });
          setSetupStatus(payload);
          if (payload.error) throw new Error(payload.error);
          setToast(t('setupNeedsLogin'));
        });
      }

      async function setupStop() {
        await run('setup-stop', async () => {
          const payload = await api('/setup/stop', { method: 'POST', body: {} });
          setSetupStatus(payload);
          setToast(t('bridgeStopped'));
        });
      }

      async function refreshCapture() {
        try {
          const payload = await api('/capture/status');
          setCaptureStatus(payload);
          return payload;
        } catch (err) {
          setCaptureStatus({ error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      }

      async function startCapture() {
        await run('capture-start', async () => {
          const payload = await api('/capture/start', { method: 'POST', body: {} });
          setCaptureStatus(payload);
          if (payload.error) throw new Error(payload.error);
          setToast(t('captureActive'));
        });
      }

      async function stopCapture() {
        await run('capture-stop', async () => {
          const payload = await api('/capture/stop', { method: 'POST', body: {} });
          setCaptureStatus(payload);
          setToast(t('captureInactive'));
        });
      }

      async function importCapturedSession() {
        await run('capture-import', async () => {
          const payload = await api('/capture/import', { method: 'POST', body: {} });
          setToast(t('captureImported'));
          await refreshCapture();
          await refreshInteraction();
        });
      }

      async function loadComments() {
        const bookId = interactionBookId();
        if (!bookId) {
          setError(t('interactionNeedBook'));
          return;
        }
        await run('comments', async () => {
          const payload = await api(`/interaction/comments?bookId=${encodeURIComponent(bookId)}&count=10`);
          setLatestComments(payload.comments ?? []);
          setToast(t('interactionRefresh'));
        });
      }

      async function postComment() {
        const bookId = interactionBookId();
        if (!bookId) {
          setError(t('interactionNeedBook'));
          return;
        }
        if (!commentText.trim()) return;
        await run('comment', async () => {
          const payload = await api('/interaction/comment', {
            method: 'POST',
            body: { bookId, text: commentText.trim(), score: commentScore },
          });
          setCommentText('');
          setToast(`${t('interactionPosted')}${payload.commentId ? ` · ${payload.commentId}` : ''}`);
          await refreshInteraction();
        });
      }

      async function postReply() {
        const bookId = interactionBookId();
        if (!bookId) {
          setError(t('interactionNeedBook'));
          return;
        }
        if (!replyId.trim() || !replyText.trim()) return;
        await run('reply', async () => {
          const payload = await api('/interaction/reply', {
            method: 'POST',
            body: { bookId, commentId: replyId.trim(), text: replyText.trim() },
          });
          setReplyText('');
          setToast(`${t('interactionReplied')}${payload.replyId ? ` · ${payload.replyId}` : ''}`);
          await refreshInteraction();
        });
      }

      async function run(label, task) {
        setBusy(label);
        setError('');
        try {
          return await task();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          return null;
        } finally {
          setBusy('');
        }
      }

      async function loadChapter({ bookId, itemId, index, tocData }) {
        if (!bookId) return;
        const params = new URLSearchParams();
        params.set('book', bookId);
        if (itemId) params.set('item', itemId);
        else if (index) params.set('index', String(index));
        const payload = await api(`/chapter?${params.toString()}`);
        setBook(payload.book);
        setToc(payload.toc?.chapters ?? tocData ?? []);
        setChapter(payload.chapter);
        setShowToc(false);
        setView('reader');
        await refreshState();
        return payload;
      }

      async function openBook(input) {
        if (!input || busy) return;
        await run(t('opening'), async () => {
          const payload = await api('/open', { method: 'POST', body: { book: input } });
          setBook(payload.book);
          setToc(payload.toc?.chapters ?? []);
          const entry = payload.shelfEntry;
          const targetItem = entry?.itemId || payload.toc?.chapters?.[0]?.itemId;
          if (targetItem) {
            await loadChapter({
              bookId: payload.book.bookId,
              itemId: targetItem,
              tocData: payload.toc?.chapters,
            });
          } else {
            setView('reader');
            setChapter(null);
          }
          await refreshState();
        });
      }

      async function search() {
        const text = query.trim();
        if (!text || busy) return;
        await run(t('searching'), async () => {
          const payload = await api('/search', { method: 'POST', body: { query: text } });
          setResults(payload.results ?? []);
          setSearchHint(payload.hint ?? '');
          setView('search');
        });
      }

      async function continueReading(entry) {
        if (!entry || busy) return;
        await run(t('chapterLoading'), async () => {
          const itemId = entry.itemId || undefined;
          const index = !itemId ? entry.chapterIndex || 1 : undefined;
          await loadChapter({ bookId: entry.bookId, itemId, index });
        });
      }

      async function jumpChapter(index) {
        if (!book || busy) return;
        await run(t('chapterLoading'), async () => {
          await loadChapter({ bookId: book.bookId, index });
        });
      }

      async function stepChapter(direction) {
        if (!chapter || !book || busy) return;
        const itemId = direction === 'prev' ? chapter.prevItemId : chapter.nextItemId;
        if (itemId) {
          await run(t('chapterLoading'), async () => {
            await loadChapter({ bookId: book.bookId, itemId });
          });
          return;
        }
        const currentIndex = toc.findIndex((entry) => entry.itemId === chapter.itemId);
        const target = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
        if (!toc[target]) return;
        await jumpChapter(target + 1);
      }

      async function removeBook(entry) {
        if (!entry || busy) return;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
          if (!window.confirm(t('removeConfirm'))) return;
        }
        await run(t('opening'), async () => {
          await api('/shelf', {
            method: 'POST',
            body: { action: 'remove', bookId: entry.bookId },
          });
          await refreshState();
          if (book?.bookId === entry.bookId) {
            setBook(null);
            setChapter(null);
            setToc([]);
            setView('shelf');
          }
        });
      }

      async function openSessions() {
        setView('sessions');
        await run(t('loading'), async () => {
          const payload = await api('/sessions');
          setSessions(payload.sessions ?? []);
          if (payload.bound) setData((current) => ({ ...current, bound: payload.bound }));
        });
      }

      async function bindSession(session) {
        if (!session || busy) return;
        await run(t('loading'), async () => {
          const payload = await api('/bind', {
            method: 'POST',
            body: { sessionId: session.id, title: session.title },
          });
          setData((current) => ({ ...current, bound: payload.bound }));
          setToast(t('sessionBound'));
          setView('shelf');
        });
      }

      async function unbindSession() {
        if (busy) return;
        await run(t('loading'), async () => {
          await api('/unbind', { method: 'POST', body: {} });
          setData((current) => ({ ...current, bound: null }));
          setToast(t('sessionUnbound'));
        });
      }

      async function createSession() {
        if (busy) return;
        await run(t('loading'), async () => {
          const payload = await api('/sessions/create', { method: 'POST', body: {} });
          setData((current) => ({ ...current, bound: payload.bound }));
          const list = await api('/sessions');
          setSessions(list.sessions ?? []);
          setToast(t('sessionCreated'));
          setView('shelf');
        });
      }

      async function askAI() {
        if (!chapter || !book || busy) return;
        if (!bound) {
          setError(t('aiNeedBinding'));
          await openSessions();
          return;
        }
        await run(t('aiSending'), async () => {
          await api('/ask', {
            method: 'POST',
            body: { bookId: book.bookId, itemId: chapter.itemId },
          });
          setToast(`${t('aiSent')}${bound.title ? ` · ${bound.title}` : ''}`);
        });
      }

      async function saveCookie() {
        if (busy) return;
        await run(t('loading'), async () => {
          const payload = await api('/cookie', {
            method: 'POST',
            body: { cookie: cookieInput },
          });
          setCookieInput('');
          setData((current) => ({
            ...current,
            cookieSet: payload.cookieSet,
            account: payload.account ?? current?.account ?? null,
          }));
          setToast(payload.cookieSet ? t('cookieSaved') : t('cookieCleared'));
        });
      }

      async function clearCookie() {
        if (busy) return;
        await run(t('loading'), async () => {
          await api('/cookie', {
            method: 'POST',
            body: { cookie: '' },
          });
          setCookieInput('');
          setData((current) => ({ ...current, cookieSet: false, account: null }));
          setToast(t('cookieCleared'));
        });
      }

      async function startLogin() {
        if (busy) return;
        await run(t('loading'), async () => {
          const payload = await api('/login/start', { method: 'POST', body: {} });
          setLogin({
            loginToken: payload.loginToken,
            image: payload.image,
            expiresAt: payload.expiresAt,
            hint: payload.hint || t('qrHintDefault'),
            status: 'waiting',
          });
        });
      }

      async function logoutAccount() {
        if (busy) return;
        await run(t('loading'), async () => {
          await api('/logout', { method: 'POST', body: {} });
          setLogin(null);
          setData((current) => ({ ...current, account: null, cookieSet: false }));
          setToast(t('logoutDone'));
        });
      }

      const shelf = data?.shelf ?? [];
      const hasPrev = Boolean(chapter?.prevItemId) || toc.findIndex((entry) => entry.itemId === chapter?.itemId) > 0;
      const currentIndex = toc.findIndex((entry) => entry.itemId === chapter?.itemId);
      const hasNext = Boolean(chapter?.nextItemId) || (currentIndex >= 0 && currentIndex < toc.length - 1);

      const header = h(
        'header',
        { className: 'fr-header' },
        h(
          'div',
          { className: 'fr-brand' },
          h('span', { className: 'fr-brand-icon' }, h(Icon, { size: 20 })),
          h(
            'div',
            null,
            h('div', { className: 'fr-brand-title' }, t('appTitle')),
            h('div', { className: 'fr-brand-subtitle' }, t('appSubtitle')),
          ),
        ),
        h(
          'div',
          { className: 'fr-header-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'fr-ghost-btn',
              onClick: () => {
                setView('shelf');
                refreshState();
              },
              disabled: busy === t('loading'),
            },
            t('refresh'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'fr-ghost-btn',
              onClick: () => setView('settings'),
            },
            t('settings'),
          ),
        ),
      );

      const binding = h(
        'div',
        { className: 'fr-binding' },
        h(
          'div',
          { className: 'fr-binding-main' },
          h('span', { className: `fr-dot ${bound ? 'is-on' : ''}`.trim() }),
          h(
            'span',
            { className: 'fr-binding-text' },
            bound
              ? `${t('boundTo')} · ${bound.title}`
              : t('boundNone'),
          ),
          bound?.running ? h('span', { className: 'fr-badge' }, t('sessionRunning')) : null,
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'fr-link-btn',
            onClick: openSessions,
          },
          bound ? t('changeSession') : t('chooseSession'),
        ),
      );

      let body;
      if (view === 'reader') {
        body = h(
          'section',
          { className: 'fr-reader' },
          h(
            'div',
            { className: 'fr-reader-bar' },
            h(
              'button',
              {
                type: 'button',
                className: 'fr-ghost-btn',
                onClick: () => setView('shelf'),
              },
              `← ${t('backToShelf')}`,
            ),
            h(
              'div',
              { className: 'fr-reader-heading' },
              h('div', { className: 'fr-reader-book' }, book?.title ?? ''),
              h('div', { className: 'fr-reader-chapter' }, chapter?.title ?? ''),
            ),
            h(
              'div',
              { className: 'fr-reader-actions' },
              h(
                'button',
                { type: 'button', className: 'fr-ghost-btn', onClick: () => setShowToc(true) },
                t('chapterList'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-primary-btn',
                  onClick: askAI,
                  disabled: Boolean(busy) || !chapter,
                  title: t('aiReadHint'),
                },
                busy === t('aiSending') ? t('aiSending') : t('aiRead'),
              ),
            ),
          ),
          chapter
            ? h(
              'article',
              { className: 'fr-paper' },
              h('h1', null, chapter.title || ''),
              h(
                'div',
                { className: 'fr-paper-meta' },
                book?.title ?? '',
                ' · ',
                format('chapterProgress', {
                  index: chapter.index || currentIndex + 1 || '?',
                  total: toc.length || '?',
                }),
              ),
              chapter.locked
                ? h(
                  'div',
                  { className: 'fr-lock' },
                  h('strong', null, t('lockedTitle')),
                  h('p', null, t('lockedBody')),
                )
                : null,
              h(
                'div',
                { className: 'fr-paper-text' },
                ...(chapter.content
                  ? chapter.content.split(/\n\n+/).map((paragraph, index) =>
                    h('p', { key: index }, paragraph),
                  )
                  : [h('p', { key: 'empty' }, t('tocEmpty'))]),
              ),
            )
            : h('div', { className: 'fr-state' }, h('p', null, t('loading'))),
          h(
            'div',
            { className: 'fr-reader-footer' },
            h(
              'button',
              {
                type: 'button',
                className: 'fr-ghost-btn',
                disabled: !hasPrev || Boolean(busy),
                onClick: () => stepChapter('prev'),
              },
              t('prevChapter'),
            ),
            h(
              'button',
              { type: 'button', className: 'fr-ghost-btn', onClick: () => setShowToc(true) },
              t('chapterList'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'fr-ghost-btn',
                disabled: !hasNext || Boolean(busy),
                onClick: () => stepChapter('next'),
              },
              t('nextChapter'),
            ),
          ),
          showToc
            ? h(
              'div',
              {
                className: 'fr-drawer-backdrop',
                onClick: () => setShowToc(false),
              },
              h(
                'aside',
                {
                  className: 'fr-drawer',
                  role: 'dialog',
                  'aria-modal': 'true',
                  onClick: (event) => event.stopPropagation(),
                },
                h(
                  'div',
                  { className: 'fr-drawer-head' },
                  h('strong', null, t('chapterList')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'fr-icon-btn',
                      onClick: () => setShowToc(false),
                      'aria-label': t('close'),
                    },
                    '×',
                  ),
                ),
                h(
                  'div',
                  { className: 'fr-drawer-list' },
                  ...toc.map((entry) =>
                    h(
                      'button',
                      {
                        key: entry.itemId,
                        type: 'button',
                        className:
                          `fr-toc-row ${entry.itemId === chapter?.itemId ? 'is-current' : ''}`.trim(),
                        onClick: () => jumpChapter(entry.index),
                      },
                      h('span', { className: 'fr-toc-index' }, entry.index),
                      h('span', { className: 'fr-toc-title' }, entry.title || `第 ${entry.index} 章`),
                      entry.locked ? h('span', { className: 'fr-toc-lock' }, t('tocLocked')) : null,
                    ),
                  ),
                ),
              ),
            )
            : null,
        );
      } else if (view === 'sessions') {
        body = h(
          'section',
          { className: 'fr-section' },
          h(
            'div',
            { className: 'fr-section-head' },
            h(
              'button',
              { type: 'button', className: 'fr-ghost-btn', onClick: () => setView('shelf') },
              `← ${t('backToShelf')}`,
            ),
            h('h2', null, t('sessions')),
            h(
              'button',
              { type: 'button', className: 'fr-ghost-btn', onClick: openSessions, disabled: Boolean(busy) },
              t('refreshSessions'),
            ),
          ),
          h('p', { className: 'fr-hint' }, t('sessionPickerHint')),
          h(
            'div',
            { className: 'fr-session-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'fr-primary-btn',
                onClick: createSession,
                disabled: Boolean(busy),
              },
              t('newSession'),
            ),
            bound
              ? h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: unbindSession,
                  disabled: Boolean(busy),
                },
                t('unbind'),
              )
              : null,
          ),
          sessions.length === 0
            ? h('div', { className: 'fr-state' }, h('p', null, t('sessionEmpty')))
            : h(
              'div',
              { className: 'fr-session-list' },
              ...sessions.map((session) =>
                h(
                  'div',
                  {
                    key: session.id,
                    className: `fr-session-row ${session.bound ? 'is-bound' : ''}`.trim(),
                  },
                  h(
                    'div',
                    { className: 'fr-session-main' },
                    h('div', { className: 'fr-session-title' }, session.title),
                    h('div', { className: 'fr-session-id' }, `${t('sessionIdLabel')} · ${session.id}`),
                  ),
                  session.running ? h('span', { className: 'fr-badge' }, t('sessionRunning')) : null,
                  session.bound
                    ? h('span', { className: 'fr-badge is-brand' }, t('sessionCurrent'))
                    : h(
                      'button',
                      {
                        type: 'button',
                        className: 'fr-ghost-btn',
                        onClick: () => bindSession(session),
                        disabled: Boolean(busy),
                      },
                      t('bindThis'),
                    ),
                ),
              ),
            ),
        );
      } else if (view === 'search') {
        body = h(
          'section',
          { className: 'fr-section' },
          h(
            'div',
            { className: 'fr-section-head' },
            h(
              'button',
              { type: 'button', className: 'fr-ghost-btn', onClick: () => setView('shelf') },
              `← ${t('backToShelf')}`,
            ),
            h('h2', null, t('searchResults')),
          ),
          results.length === 0
            ? h(
              'div',
              { className: 'fr-state' },
              h('p', null, t('searchEmpty')),
              searchHint ? h('p', { className: 'fr-state-sub' }, searchHint) : null,
            )
            : h(
              'div',
              { className: 'fr-result-list' },
              ...results.map((item) =>
                h(
                  'article',
                  { key: item.bookId, className: 'fr-result' },
                  h(Cover, { book: item }),
                  h(
                    'div',
                    { className: 'fr-result-main' },
                    h('h3', null, item.title || item.bookId),
                    h(
                      'div',
                      { className: 'fr-result-meta' },
                      [item.author, item.chapterCount ? `${item.chapterCount} 章` : '']
                        .filter(Boolean)
                        .join(' · '),
                    ),
                    item.intro ? h('p', null, item.intro) : null,
                    h(
                      'div',
                      { className: 'fr-result-actions' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'fr-primary-btn',
                          onClick: () => openBook(item.bookId),
                          disabled: Boolean(busy),
                        },
                        t('open'),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        );
      } else if (view === 'settings') {
        const account = data?.account ?? null;
        const loggedIn = Boolean(data?.cookieSet || account);
        const qrStatus =
          login?.status === 'scanned'
            ? t('qrScanned')
            : login?.status === 'confirmed'
              ? t('qrConfirmed')
              : login?.status === 'expired'
                ? t('qrExpired')
                : login?.status === 'error'
                  ? `${t('loginFailed')}${login.message ? `：${login.message}` : ''}`
                  : t('qrWaiting');
        body = h(
          'section',
          { className: 'fr-section' },
          h(
            'div',
            { className: 'fr-section-head' },
            h(
              'button',
              { type: 'button', className: 'fr-ghost-btn', onClick: () => setView('shelf') },
              `← ${t('backToShelf')}`,
            ),
            h('h2', null, t('settingsTitle')),
          ),
          h(
            'div',
            { className: 'fr-settings-card fr-account-card' },
            h(
              'div',
              { className: 'fr-account-head' },
              account?.avatar
                ? h('img', {
                  className: 'fr-account-avatar',
                  src: account.avatar,
                  alt: account.nickname || t('accountNicknameFallback'),
                })
                : h('div', { className: 'fr-account-avatar is-placeholder' }, h(Icon, { size: 22 })),
              h(
                'div',
                { className: 'fr-account-main' },
                h('h3', null, account?.nickname || t('accountNicknameFallback')),
                h(
                  'div',
                  { className: 'fr-account-state' },
                  loggedIn ? t('accountLoggedIn') : t('accountLoggedOut'),
                ),
              ),
              loggedIn
                ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'fr-ghost-btn',
                    onClick: logoutAccount,
                    disabled: Boolean(busy),
                  },
                  t('logout'),
                )
                : h(
                  'button',
                  {
                    type: 'button',
                    className: 'fr-primary-btn',
                    onClick: startLogin,
                    disabled: Boolean(busy),
                  },
                  t('qrLogin'),
                ),
            ),
            h('p', { className: 'fr-hint' }, t('accountHint')),
            h('p', { className: 'fr-hint' }, t('socialNote')),
            login
              ? h(
                'div',
                { className: 'fr-qr-panel' },
                h('img', {
                  className: 'fr-qr-image',
                  src: login.image,
                  alt: t('qrImageAlt'),
                }),
                h('div', { className: 'fr-qr-status' }, qrStatus),
                h('p', { className: 'fr-hint' }, login.hint || t('qrHintDefault')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fr-ghost-btn',
                    onClick: () => setLogin(null),
                  },
                  t('cancel'),
                ),
              )
              : null,
          ),
          h(
            'div',
            { className: 'fr-settings-card fr-interaction-card' },
            h('h3', null, t('interactionTitle')),
            h('p', { className: 'fr-hint' }, t('interactionHint')),
            h(
              'div',
              { className: 'fr-interaction-settings' },
              h('div', { className: 'fr-field-label' }, t('interactionSettingsTitle')),
              h(
                'label',
                { className: 'fr-check-row' },
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(interactionSettings.autoPost),
                  onChange: (event) => setInteractionSettings((current) => ({
                    ...current,
                    autoPost: event.target.checked,
                  })),
                }),
                h('span', null, t('interactionAutoPost')),
              ),
              h('p', { className: 'fr-hint' }, t('interactionAutoPostHint')),
              h(
                'div',
                { className: 'fr-interaction-row' },
                h('label', { className: 'fr-inline-label' },
                  t('interactionDailyLimit'),
                  h('input', {
                    type: 'number',
                    className: 'fr-number-input',
                    min: 1,
                    max: 50,
                    value: interactionSettings.dailyLimit,
                    onChange: (event) => setInteractionSettings((current) => ({
                      ...current,
                      dailyLimit: event.target.value,
                    })),
                  }),
                  t('interactionLimitUnit'),
                ),
                h('label', { className: 'fr-inline-label' },
                  t('interactionMinGap'),
                  h('input', {
                    type: 'number',
                    className: 'fr-number-input',
                    min: 5,
                    max: 300,
                    value: interactionSettings.minGapSeconds,
                    onChange: (event) => setInteractionSettings((current) => ({
                      ...current,
                      minGapSeconds: event.target.value,
                    })),
                  }),
                  t('interactionGapUnit'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fr-ghost-btn',
                    onClick: saveInteractionSettings,
                    disabled: Boolean(busy),
                  },
                  t('interactionSaveSettings'),
                ),
              ),
            ),
            h(
              'div',
              { className: 'fr-account-state' },
              interaction?.connected
                ? `${t('interactionConnected')} · ${interaction.account?.userName || interaction.account?.userId || ''} · ${t('interactionDaily')} ${interaction.dailyCount ?? 0}/${interaction.dailyLimit ?? 10}`
                : t('interactionDisconnected'),
            ),
            interaction?.connected
              ? h(
                'div',
                { className: 'fr-interaction-form' },
                h('label', { className: 'fr-field-label' }, t('interactionCommentLabel')),
                h('textarea', {
                  className: 'fr-cookie-input',
                  rows: 3,
                  value: commentText,
                  onChange: (event) => setCommentText(event.target.value),
                  placeholder: t('interactionCommentPlaceholder'),
                  maxLength: 2000,
                }),
                h(
                  'div',
                  { className: 'fr-interaction-row' },
                  h(
                    'select',
                    {
                      className: 'fr-score-select',
                      value: commentScore,
                      onChange: (event) => setCommentScore(Number(event.target.value)),
                    },
                    ...[10, 8, 6, 4, 2].map((value) => h(
                      'option',
                      { key: value, value },
                      `${value / 2} ★`,
                    )),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'fr-primary-btn',
                      onClick: postComment,
                      disabled: Boolean(busy) || !commentText.trim(),
                    },
                    t('interactionPostComment'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'fr-ghost-btn',
                      onClick: loadComments,
                      disabled: Boolean(busy),
                    },
                    t('interactionLoadComments'),
                  ),
                ),
                h('label', { className: 'fr-field-label' }, t('interactionReplyIdLabel')),
                h('input', {
                  className: 'fr-cookie-input',
                  value: replyId,
                  onChange: (event) => setReplyId(event.target.value),
                  placeholder: t('interactionReplyIdPlaceholder'),
                  spellCheck: false,
                }),
                h('label', { className: 'fr-field-label' }, t('interactionReplyLabel')),
                h('textarea', {
                  className: 'fr-cookie-input',
                  rows: 2,
                  value: replyText,
                  onChange: (event) => setReplyText(event.target.value),
                  placeholder: t('interactionReplyPlaceholder'),
                  maxLength: 500,
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fr-primary-btn',
                    onClick: postReply,
                    disabled: Boolean(busy) || !replyId.trim() || !replyText.trim(),
                  },
                  t('interactionPostReply'),
                ),
                latestComments.length > 0
                  ? h(
                    'div',
                    { className: 'fr-comment-picker' },
                    h('div', { className: 'fr-field-label' }, t('interactionCommentsTitle')),
                    h('p', { className: 'fr-hint' }, t('interactionSelectComment')),
                    ...latestComments.map((item) => h(
                      'button',
                      {
                        key: item.commentId,
                        type: 'button',
                        className: 'fr-comment-row',
                        onClick: () => setReplyId(item.commentId),
                      },
                      h('strong', null, item.userName || '书友'),
                      h('span', null, item.text.slice(0, 140)),
                    )),
                  )
                  : h('p', { className: 'fr-hint' }, t('interactionNoComments')),
              )
              : h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: refreshInteraction,
                  disabled: Boolean(busy),
                },
                t('interactionRefresh'),
              ),
          ),
          h(
            'div',
            { className: 'fr-settings-card' },
            h('h3', null, t('runtimeTitle')),
            h('p', { className: 'fr-hint' }, t('runtimeHint')),
            h(
              'label',
              { className: 'fr-check-row' },
              h('input', {
                type: 'checkbox',
                checked: Boolean(runtimeSchedule.enabled),
                onChange: (event) => setRuntimeSchedule((current) => ({
                  ...current,
                  enabled: event.target.checked,
                })),
              }),
              h('span', null, t('runtimeEnable')),
            ),
            h(
              'div',
              { className: 'fr-interaction-row' },
              h('label', { className: 'fr-inline-label' },
                t('runtimeStart'),
                h('input', {
                  type: 'time',
                  className: 'fr-time-input',
                  value: runtimeSchedule.start,
                  onChange: (event) => setRuntimeSchedule((current) => ({
                    ...current,
                    start: event.target.value,
                  })),
                }),
              ),
              h('label', { className: 'fr-inline-label' },
                t('runtimeEnd'),
                h('input', {
                  type: 'time',
                  className: 'fr-time-input',
                  value: runtimeSchedule.end,
                  onChange: (event) => setRuntimeSchedule((current) => ({
                    ...current,
                    end: event.target.value,
                  })),
                }),
              ),
            ),
            h('div', { className: 'fr-field-label' }, t('runtimeDays')),
            h(
              'div',
              { className: 'fr-days-row' },
              ...['一', '二', '三', '四', '五', '六', '日'].map((label, index) => {
                const day = index + 1;
                return h(
                  'label',
                  { key: day, className: 'fr-day-check' },
                  h('input', {
                    type: 'checkbox',
                    checked: runtimeSchedule.days.includes(day),
                    onChange: (event) => setRuntimeSchedule((current) => {
                      const set = new Set(current.days);
                      if (event.target.checked) set.add(day); else set.delete(day);
                      return { ...current, days: [...set].sort((a, b) => a - b) };
                    }),
                  }),
                  h('span', null, label),
                );
              }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'fr-ghost-btn',
                onClick: saveRuntimeSchedule,
                disabled: Boolean(busy),
              },
              t('runtimeSave'),
            ),
            h(
              'div',
              { className: 'fr-bridge-status' },
              h('div', { className: 'fr-field-label' }, t('bridgeStatus')),
              h(
                'div',
                { className: 'fr-account-state' },
                bridgeStatus?.installed
                  ? (bridgeStatus.running
                    ? `${t('bridgeRunning')}${bridgeStatus.adb ? ' · ADB OK' : ''}`
                    : (bridgeStatus.starting ? t('bridgeStarting') : t('bridgeStopped')))
                  : t('bridgeNotInstalled'),
              ),
              bridgeStatus?.error ? h('p', { className: 'fr-hint' }, `${t('bridgeError')}：${bridgeStatus.error}`) : null,
              h(
                'div',
                { className: 'fr-interaction-row' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fr-primary-btn',
                    onClick: startBridge,
                    disabled: Boolean(busy) || Boolean(bridgeStatus?.running) || !bridgeStatus?.installed,
                  },
                  t('bridgeStart'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fr-ghost-btn',
                    onClick: stopBridge,
                    disabled: Boolean(busy) || !bridgeStatus?.running,
                  },
                  t('bridgeStop'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'fr-ghost-btn',
                    onClick: refreshBridge,
                    disabled: Boolean(busy),
                  },
                  t('bridgeRefresh'),
                ),
              ),
            ),
          ),
          h(
            'div',
            { className: 'fr-settings-card' },
            h('h3', null, t('setupTitle')),
            h('p', { className: 'fr-hint' }, t('setupHint')),
            h(
              'div',
              { className: 'fr-account-state' },
              setupStatus?.installed && setupStatus?.appInstalled
                ? t('setupReady')
                : t('setupMissing'),
              setupStatus?.apkReady ? '' : ` · ${t('setupApkMissing')}`,
            ),
            setupStatus?.apkPath ? h('p', { className: 'fr-hint' }, `APK: ${setupStatus.apkPath}`) : null,
            h(
              'div',
              { className: 'fr-interaction-row' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-primary-btn',
                  onClick: setupOneClick,
                  disabled: Boolean(busy) || Boolean(setupStatus?.installing) || !setupStatus?.apkReady,
                },
                setupStatus?.installing ? t('setupBusy') : t('setupOneClick'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: setupLogin,
                  disabled: Boolean(busy) || Boolean(setupStatus?.installing) || !setupStatus?.installed,
                },
                t('setupLogin'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: setupStop,
                  disabled: Boolean(busy),
                },
                t('setupStop'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: refreshSetup,
                  disabled: Boolean(busy),
                },
                t('setupRefresh'),
              ),
            ),
            setupStatus?.log ? h('pre', { className: 'fr-setup-log' }, setupStatus.log) : null,
          ),
          h(
            'div',
            { className: 'fr-settings-card' },
            h('h3', null, t('captureTitle')),
            h('p', { className: 'fr-hint' }, t('captureHint')),
            h('p', { className: 'fr-hint' }, t('captureConsent')),
            h(
              'div',
              { className: 'fr-account-state' },
              captureStatus?.active ? t('captureActive') : t('captureInactive'),
              captureStatus?.authReady ? ` · ${t('captureAuthReady')}` : ` · ${t('captureAuthMissing')}`,
            ),
            h(
              'p',
              { className: 'fr-hint' },
              `${captureStatus?.root ? 'root OK' : t('captureRootMissing')} · ${captureStatus?.ca ? 'CA OK' : t('captureCaMissing')}${captureStatus?.captureBytes ? ` · ${captureStatus.captureBytes} bytes` : ''}`,
            ),
            captureStatus?.error ? h('p', { className: 'fr-hint' }, captureStatus.error) : null,
            h(
              'div',
              { className: 'fr-interaction-row' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-primary-btn',
                  onClick: startCapture,
                  disabled: Boolean(busy) || Boolean(captureStatus?.active) || !captureStatus?.bridgeRunning || !captureStatus?.root || !captureStatus?.ca,
                },
                t('captureStart'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: stopCapture,
                  disabled: Boolean(busy) || !captureStatus?.active,
                },
                t('captureStop'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: importCapturedSession,
                  disabled: Boolean(busy) || Boolean(captureStatus?.active) || !captureStatus?.captureBytes,
                },
                t('captureImport'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: refreshCapture,
                  disabled: Boolean(busy),
                },
                t('captureRefresh'),
              ),
            ),
          ),
          h(
            'div',
            { className: 'fr-settings-card' },
            h('h3', null, t('cookieTitle')),
            h(
              'p',
              { className: 'fr-hint' },
              t('cookieHint'),
            ),
            h('div', { className: 'fr-cookie-state' }, data?.cookieSet ? t('cookieSet') : t('cookieUnset')),
            h('textarea', {
              className: 'fr-cookie-input',
              value: cookieInput,
              onChange: (event) => setCookieInput(event.target.value),
              placeholder: t('cookiePlaceholder'),
              rows: 4,
              spellCheck: false,
            }),
            h(
              'div',
              { className: 'fr-settings-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-primary-btn',
                  onClick: saveCookie,
                  disabled: Boolean(busy),
                },
                t('saveCookie'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'fr-ghost-btn',
                  onClick: clearCookie,
                  disabled: Boolean(busy),
                },
                t('clearCookie'),
              ),
            ),
          ),
        );
      } else {
        body = h(
          'section',
          { className: 'fr-shelf' },
          h(
            'div',
            { className: 'fr-search-box' },
            h('input', {
              className: 'fr-search-input',
              value: query,
              onChange: (event) => setQuery(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') search();
              },
              placeholder: t('searchPlaceholder'),
              spellCheck: false,
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'fr-primary-btn',
                onClick: search,
                disabled: Boolean(busy),
              },
              t('searchButton'),
            ),
          ),
          h('p', { className: 'fr-hint' }, t('searchHint')),
          shelf.length === 0
            ? h(
              'div',
              { className: 'fr-empty' },
              h('div', { className: 'fr-empty-mark' }, h(Icon, { size: 44 })),
              h('h3', null, t('shelfEmptyTitle')),
              h('p', null, t('shelfEmptyBody')),
            )
            : h(
              'div',
              { className: 'fr-shelf-grid' },
              ...shelf.map((entry) => {
                const progress = entry.chapterCount
                  ? Math.min(100, Math.round(((entry.chapterIndex || 0) / entry.chapterCount) * 100))
                  : 0;
                return h(
                  'article',
                  { key: entry.bookId, className: 'fr-book-card' },
                  h(Cover, { book: entry }),
                  h(
                    'div',
                    { className: 'fr-book-body' },
                    h('h3', null, entry.title || entry.bookId),
                    h(
                      'div',
                      { className: 'fr-book-meta' },
                      [entry.author, entry.chapterCount ? `${entry.chapterCount} 章` : '']
                        .filter(Boolean)
                        .join(' · '),
                    ),
                    entry.chapterIndex
                      ? h(
                        'div',
                        { className: 'fr-book-progress' },
                        h('div', { className: 'fr-progress-track' },
                          h('div', { className: 'fr-progress-fill', style: { width: `${progress}%` } })),
                        h(
                          'span',
                          { className: 'fr-progress-label' },
                          format('readProgress', {
                            chapter: entry.chapterTitle || format('chapterProgress', {
                              index: entry.chapterIndex,
                              total: entry.chapterCount || '?',
                            }),
                          }),
                        ),
                      )
                      : h('div', { className: 'fr-book-progress is-empty' }, t('notStarted')),
                    h(
                      'div',
                      { className: 'fr-book-actions' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'fr-primary-btn',
                          onClick: () => continueReading(entry),
                          disabled: Boolean(busy),
                        },
                        entry.chapterIndex ? t('continueReading') : t('startReading'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'fr-ghost-btn',
                          onClick: () => removeBook(entry),
                          disabled: Boolean(busy),
                        },
                        t('removeBook'),
                      ),
                    ),
                  ),
                );
              }),
            ),
        );
      }

      return h(
        'div',
        { className: 'fr-root' },
        h('style', null, CSS),
        header,
        binding,
        h(
          'main',
          { className: 'fr-main' },
          h(ErrorBanner, { message: error, onClose: () => setError('') }),
          body,
        ),
        toast ? h('div', { className: 'fr-toast', role: 'status' }, toast) : null,
      );
    }

    function registerUi(ctx) {
      ctx.slots.inject('main', () =>
        ctx.slots.register(
          { name: 'main', key: PANEL_ID, locale: NS },
          FanqieReaderPanel,
        ),
      );
      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 58,
            locale: NS,
            label: () => t('appTitle'),
          },
          function SidebarIcon() {
            return h('span', { className: 'fr-sidebar-icon' }, h(Icon, { size: 20 }));
          },
        ),
      );
    }

    function apply(ctx) {
      const disposeLocale = ctx.locale.register(NS, DICTIONARY);
      t = ctx.locale.bind(NS);
      const ui = ctx.inject(['slots'], () => registerUi(ctx));
      return () => {
        ui?.dispose?.();
        disposeLocale?.();
      };
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});

const CSS = `
.fr-root {
  --fr-radius: 12px;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  height: 100%;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
}
.fr-header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 26px 14px;
  background: var(--dsw-alias-bg-base);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.fr-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.fr-brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
.fr-brand-title { font-size: 16px; font-weight: 650; letter-spacing: 0.01em; }
.fr-brand-subtitle { margin-top: 2px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.fr-header-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.fr-binding {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 26px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  font-size: 12px;
}
.fr-binding-main { display: flex; align-items: center; gap: 8px; min-width: 0; }
.fr-binding-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); flex: none; }
.fr-dot.is-on { background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent); }
.fr-main { flex: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 22px 26px 48px; }
.fr-error {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.5;
}
.fr-ghost-btn, .fr-primary-btn, .fr-link-btn, .fr-icon-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
}
.fr-ghost-btn {
  padding: 7px 11px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  white-space: nowrap;
}
.fr-ghost-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.fr-primary-btn {
  padding: 8px 14px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
  color: var(--dsw-alias-brand-primary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.fr-primary-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent); }
.fr-link-btn { padding: 2px 0; color: var(--dsw-alias-brand-primary); font-size: 12px; white-space: nowrap; }
.fr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 7px; font-size: 18px; color: var(--dsw-alias-label-secondary); flex: none; }
.fr-icon-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.fr-ghost-btn:disabled, .fr-primary-btn:disabled { opacity: 0.45; cursor: default; }
.fr-badge { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 11px; white-space: nowrap; }
.fr-badge.is-brand { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent); color: var(--dsw-alias-brand-primary); }
.fr-hint { margin: 8px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
.fr-search-box { display: flex; gap: 8px; align-items: stretch; }
.fr-search-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  outline: none;
}
.fr-search-input:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.fr-shelf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; margin-top: 20px; }
.fr-book-card {
  display: flex;
  gap: 13px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--fr-radius);
  background: var(--dsw-alias-bg-layer-1);
  min-width: 0;
}
.fr-book-card:hover { border-color: var(--dsw-alias-border-l2); }
.fr-cover {
  width: 66px;
  height: 88px;
  flex: none;
  border-radius: 6px;
  background-color: var(--dsw-alias-bg-layer-2);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  overflow: hidden;
}
.fr-book-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.fr-book-body h3, .fr-result-main h3 { margin: 0; font-size: 14px; font-weight: 650; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-book-meta, .fr-result-meta { margin-top: 4px; color: var(--dsw-alias-label-secondary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-book-progress { margin-top: auto; padding-top: 10px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.fr-book-progress.is-empty { margin-top: auto; }
.fr-progress-track { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; margin-bottom: 6px; }
.fr-progress-fill { height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); }
.fr-progress-label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-book-actions { display: flex; align-items: center; gap: 4px; margin-top: 9px; }
.fr-book-actions .fr-ghost-btn { padding: 6px 8px; border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); }
.fr-book-actions .fr-ghost-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.fr-book-actions .fr-primary-btn { padding: 6px 10px; }
.fr-empty { padding: 54px 16px; text-align: center; }
.fr-empty-mark { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px; border-radius: 22px; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.fr-empty h3 { margin: 16px 0 6px; font-size: 15px; }
.fr-empty p { max-width: 420px; margin: 0 auto; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.65; }
.fr-section { max-width: 860px; margin: 0 auto; }
.fr-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.fr-section-head h2 { flex: 1; margin: 0; font-size: 17px; font-weight: 650; }
.fr-section-head .fr-ghost-btn:first-child { border-color: transparent; background: transparent; padding-left: 0; color: var(--dsw-alias-label-secondary); }
.fr-result-list { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
.fr-result { display: flex; gap: 14px; padding: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--fr-radius); background: var(--dsw-alias-bg-layer-1); }
.fr-result .fr-cover { width: 58px; height: 78px; }
.fr-result-main { flex: 1; min-width: 0; }
.fr-result-main p { margin: 6px 0 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.fr-result-actions { margin-top: 8px; }
.fr-session-actions { display: flex; gap: 8px; margin: 16px 0; }
.fr-session-list { display: flex; flex-direction: column; gap: 8px; }
.fr-session-row { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.fr-session-row.is-bound { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent); }
.fr-session-main { flex: 1; min-width: 0; }
.fr-session-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-session-id { margin-top: 3px; color: var(--dsw-alias-label-secondary); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-settings-card { margin-top: 16px; padding: 16px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--fr-radius); background: var(--dsw-alias-bg-layer-1); }
.fr-settings-card h3 { margin: 0 0 6px; font-size: 14px; }
.fr-account-head { display: flex; align-items: center; gap: 12px; }
.fr-account-avatar { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; flex: none; background: var(--dsw-alias-bg-layer-2); }
.fr-account-avatar.is-placeholder { display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
.fr-account-main { flex: 1; min-width: 0; }
.fr-account-main h3 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-account-state { margin-top: 3px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.fr-qr-panel { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 16px; padding: 14px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-base); }
.fr-qr-image { width: min(240px, 70vw); height: auto; border-radius: 8px; background: #fff; image-rendering: pixelated; }
.fr-qr-status { color: var(--dsw-alias-brand-primary); font-size: 12px; font-weight: 600; text-align: center; }
.fr-qr-panel .fr-hint { margin: 0; text-align: center; }
.fr-cookie-state { margin: 10px 0 6px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.fr-cookie-input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; resize: vertical; }
.fr-interaction-form { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.fr-interaction-settings { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--dsw-alias-border-l1); }
.fr-check-row { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; }
.fr-inline-label { display: inline-flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.fr-number-input { width: 62px; padding: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.fr-time-input { padding: 6px 7px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.fr-days-row { display: flex; gap: 5px; flex-wrap: wrap; }
.fr-day-check { display: inline-flex; align-items: center; gap: 3px; padding: 4px 7px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 11px; cursor: pointer; }
.fr-setup-log { max-height: 120px; overflow: auto; margin: 8px 0 0; padding: 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font-size: 10px; white-space: pre-wrap; }
.fr-field-label { margin-top: 6px; color: var(--dsw-alias-label-secondary); font-size: 11px; font-weight: 600; }
.fr-interaction-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fr-score-select { padding: 7px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.fr-comment-picker { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.fr-comment-row { display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 11px; text-align: left; cursor: pointer; }
.fr-comment-row:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent); }
.fr-comment-row strong { font-size: 11px; }
.fr-comment-row span { color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.fr-settings-actions { display: flex; gap: 8px; margin-top: 10px; }
.fr-reader { max-width: 860px; margin: 0 auto; }
.fr-reader-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.fr-reader-heading { flex: 1; min-width: 0; }
.fr-reader-book { color: var(--dsw-alias-label-secondary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-reader-chapter { margin-top: 2px; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-reader-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.fr-paper { padding: 34px 44px 42px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
.fr-paper h1 { margin: 0; font-family: "Songti SC", "Noto Serif SC", "STSong", Georgia, serif; font-size: 24px; line-height: 1.35; font-weight: 650; }
.fr-paper-meta { margin-top: 10px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.fr-paper-text { margin-top: 26px; font-family: "Songti SC", "Noto Serif SC", "STSong", Georgia, serif; font-size: 16px; line-height: 1.95; }
.fr-paper-text p { margin: 0 0 0.95em; text-align: justify; overflow-wrap: anywhere; }
.fr-lock { margin-top: 18px; padding: 11px 13px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 38%, transparent); border-radius: 9px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); font-size: 12px; line-height: 1.6; }
.fr-lock strong { display: block; margin-bottom: 4px; }
.fr-lock p { margin: 0; color: var(--dsw-alias-label-secondary); }
.fr-reader-footer { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 18px 0 4px; }
.fr-drawer-backdrop { position: fixed; inset: 0; z-index: 20; display: flex; justify-content: flex-end; background: color-mix(in srgb, var(--dsw-alias-bg-base) 58%, transparent); backdrop-filter: blur(2px); }
.fr-drawer { display: flex; flex-direction: column; width: min(380px, 92%); height: 100%; border-left: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); box-shadow: -10px 0 30px rgba(0,0,0,0.12); }
.fr-drawer-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.fr-drawer-list { flex: 1; overflow: auto; padding: 6px 8px 20px; }
.fr-toc-row { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.fr-toc-row:hover { background: var(--dsw-alias-bg-layer-2); }
.fr-toc-row.is-current { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); }
.fr-toc-index { width: 28px; flex: none; color: var(--dsw-alias-label-secondary); font-size: 10px; text-align: right; }
.fr-toc-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-toc-lock { flex: none; padding: 1px 5px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 9px; }
.fr-state { padding: 40px 18px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.fr-state-sub { margin-top: 8px; font-size: 12px; line-height: 1.6; }
.fr-toast { position: fixed; left: 50%; bottom: 28px; z-index: 60; transform: translateX(-50%); max-width: min(520px, 86vw); padding: 10px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 8px 26px rgba(0,0,0,0.16); font-size: 12px; text-align: center; }
.fr-sidebar-icon { display: inline-flex; align-items: center; justify-content: center; }
@media (max-width: 640px) {
  .fr-header { padding: 14px 16px 12px; }
  .fr-binding { padding: 8px 16px; }
  .fr-main { padding: 16px 16px 36px; }
  .fr-paper { padding: 24px 20px 30px; }
  .fr-paper h1 { font-size: 20px; }
  .fr-paper-text { font-size: 15px; line-height: 1.9; }
  .fr-reader-bar { flex-wrap: wrap; }
  .fr-reader-actions { width: 100%; justify-content: flex-end; }
}
@media (prefers-reduced-motion: reduce) {
  .fr-root * { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
}
`;
