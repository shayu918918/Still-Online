(() => {
  "use strict";

  const app = document.querySelector("#app");
  const STORAGE_KEY = "still-one-online-v5-branch";
  const PAGE_STEPS = [
    ["network"],
    ["forum-home"],
    ["forum-search"],
    ["campus-thread"],
    ["forum-decoy"],
    ["xiaoman-router"],
    ["xiaoman-profile"],
    ["xiaoman-blog", "xiaoman-photo"],
    ["lusi-messages", "xiaoman-messages"],
    ["cloud"],
    ["lusi-profile"],
    ["blog"],
    ["baiyu"],
    ["baiyu-post"],
    ["takeover"],
    ["company"],
    ["ending-willing", "ending-refuse"],
  ];
  const initialState = {
    page: "network",
    networkFixed: false,
    fixKnown: false,
    deviceName: "WT-BOOK-23 ",
    forumQuery: "",
    forumSection: "home",
    forumSettingsSaved: false,
    inboxUnread: 1,
    pmUnread: { xiaoman: 1, lusi: 0, dousha: 0 },
    decoyTitle: "",
    unlocked: [],
    readLogs: [],
    profileTab: "logs",
    xiaomanTab: "home",
    xiaomanBlogUnlocked: false,
    xiaomanPhoto: 1,
    cloudUnlocked: false,
    cloudView: "share",
    cloudSaved: false,
    cloudFolder: "root",
    cloudFile: "",
    xiaomanChatStage: 0,
    xiaomanChatWaiting: 0,
    xiaomanUserMessages: [],
    pmContact: "xiaoman",
    doushaUserMessages: [],
    lusiPmStage: 0,
    lusiPmWaiting: false,
    lusiPmUserMessages: [],
    chatMode: "none",
    chatOpen: false,
    chatErrors: 0,
    lusiChatStage: 0,
    lusiCorrupted: false,
    takeoverPending: false,
    lusiKeyAttempts: [],
    plannerChatStage: 0,
    baiyuLoaded: 0,
    baiyuQuery: "",
    baiyuClues: [],
    baiyuLastClue: "",
    baiyuLiked: [],
    baiyuSaved: [],
    baiyuUserPosts: [],
    selectedPost: "",
    baiyuScrollY: 0,
    companySection: "home",
    companyVisited: [],
    ending: "",
    videoPlaying: false,
    scrollPositions: {},
    forumReturnPage: "forum-home",
    forumReturnLabel: "返回校园服务首页",
    profileReturnPage: "forum-home",
    profileReturnLabel: "返回校园服务首页",
    networkReturnPage: "",
    networkReturnLabel: "",
  };

  let state = loadState();
  let takeoverTimer = null;
  let lusiChatTimer = null;
  let plannerChatTimer = null;
  let companyTypeTimer = null;
  let endingAnimationFrame = null;
  let endingTransitionTimers = [];

  function loadState() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return { ...initialState };
      const merged = { ...initialState, ...saved };
      merged.pmUnread = saved.pmUnread && typeof saved.pmUnread === "object"
        ? { ...initialState.pmUnread, ...saved.pmUnread }
        : (saved.lusiPmStage ? { xiaoman: 0, lusi: Number(saved.inboxUnread) || 0, dousha: 0 } : { ...initialState.pmUnread });
      merged.inboxUnread = Object.values(merged.pmUnread).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
      if (merged.lusiPmWaiting || Number(merged.lusiPmStage) === 2) {
        merged.lusiPmWaiting = false;
        merged.lusiPmStage = 3;
      }
      if (Number(merged.xiaomanChatWaiting) > 0) {
        merged.xiaomanChatStage = Math.max(Number(merged.xiaomanChatStage) || 0, Number(merged.xiaomanChatWaiting));
        merged.xiaomanChatWaiting = 0;
      }
      if (merged.networkFixed && !merged.lusiPmStage) merged.lusiPmStage = 1;
      if (merged.chatMode === "lusi" && merged.lusiChatStage < 1) merged.lusiChatStage = 1;
      if (merged.chatMode === "planner" && merged.plannerChatStage < 1) merged.plannerChatStage = 1;
      if (merged.chatMode === "planner") merged.lusiCorrupted = true;
      if (merged.takeoverPending) {
        merged.page = "takeover";
        merged.lusiCorrupted = true;
      }
      return merged;
    } catch (_) {
      return { ...initialState };
    }
  }

  function saveState() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* no-op */ }
  }

  function getPmUnread(contact = "") {
    const unread = state.pmUnread && typeof state.pmUnread === "object" ? state.pmUnread : {};
    if (contact) return Math.max(0, Number(unread[contact]) || 0);
    return Object.values(unread).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  }

  function setPmUnread(contact, count) {
    state.pmUnread = { ...(state.pmUnread || {}), [contact]: Math.max(0, Number(count) || 0) };
    state.inboxUnread = getPmUnread();
  }

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));

  function normalizeKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  const NETWORK_LOCKED_PAGES = new Set([
    "xiaoman-profile", "xiaoman-blog", "xiaoman-photo", "lusi-profile", "blog",
    "lusi-messages", "xiaoman-messages", "cloud", "baiyu", "baiyu-post",
    "takeover", "company", "ending-willing", "ending-refuse",
  ]);
  const SCROLL_RESTORE_PAGES = new Set(["forum-home", "forum-search"]);

  function rememberNetworkReturn(source = state.page) {
    const labels = {
      "forum-home": "返回校园服务首页",
      "forum-search": "返回搜索结果",
      "campus-thread": "返回刚才的帖子",
      "xiaoman-router": "返回刚才的帖子",
      "forum-decoy": "返回刚才的帖子",
      "xiaoman-messages": "返回私信",
      "lusi-messages": "返回私信",
      "xiaoman-profile": "返回小满的主页",
      "lusi-profile": "返回鹭鸶的主页",
    };
    if (!source || source === "network") return;
    state.networkReturnPage = source;
    state.networkReturnLabel = labels[source] || "返回上一页";
  }

  function rememberOrigin(targetPage) {
    const source = state.page;
    if (targetPage === "network") rememberNetworkReturn(source);
    if (["campus-thread", "xiaoman-router", "forum-decoy"].includes(targetPage)) {
      if (source === "forum-home") {
        state.forumReturnPage = "forum-home";
        state.forumReturnLabel = "返回校园服务首页";
      } else if (source === "forum-search") {
        state.forumReturnPage = "forum-search";
        state.forumReturnLabel = "返回搜索结果";
      }
    }
    if (["xiaoman-profile", "lusi-profile"].includes(targetPage)) {
      if (["xiaoman-messages", "lusi-messages"].includes(source)) {
        state.profileReturnPage = source;
        state.profileReturnLabel = "返回私信";
      } else if (source === "forum-home") {
        state.profileReturnPage = "forum-home";
        state.profileReturnLabel = "返回校园服务首页";
      } else if (source === "forum-search") {
        state.profileReturnPage = "forum-search";
        state.profileReturnLabel = "返回搜索结果";
      } else if (["campus-thread", "xiaoman-router", "forum-decoy"].includes(source)) {
        state.profileReturnPage = source;
        state.profileReturnLabel = "返回刚才的帖子";
      }
    }
  }

  function route(page, options = {}, replace = false) {
    const previousPage = state.page;
    if (SCROLL_RESTORE_PAGES.has(previousPage)) {
      state.scrollPositions = state.scrollPositions || {};
      state.scrollPositions[previousPage] = window.scrollY;
    }
    if (!state.networkFixed && NETWORK_LOCKED_PAGES.has(page)) {
      rememberNetworkReturn(previousPage);
      page = "network";
      options = {};
    }
    state.page = page;
    Object.assign(state, options);
    if (page === "company") state.chatOpen = false;
    saveState();
    const url = new URL(window.location.href);
    url.search = page === "network" ? "" : `?page=${encodeURIComponent(page)}`;
    history[replace ? "replaceState" : "pushState"]({ page }, "", url);
    render();
    const returningToBaiyu = previousPage === "baiyu-post" && page === "baiyu";
    const forumScroll = SCROLL_RESTORE_PAGES.has(page) ? Number(state.scrollPositions?.[page]) || 0 : 0;
    window.requestAnimationFrame(() => window.scrollTo({ top: returningToBaiyu ? Number(state.baiyuScrollY) || 0 : forumScroll, behavior: "auto" }));
  }

  function resetGame() {
    if (!window.confirm("清除当前浏览记录并重新开始？")) return;
    clearRuntimeTimers();
    sessionStorage.removeItem(STORAGE_KEY);
    state = { ...initialState, pmUnread: { ...initialState.pmUnread } };
    route("network", {}, true);
  }

  function clearRuntimeTimers() {
    window.clearTimeout(takeoverTimer);
    window.clearTimeout(lusiChatTimer);
    window.clearTimeout(plannerChatTimer);
    window.clearTimeout(companyTypeTimer);
    takeoverTimer = null;
    lusiChatTimer = null;
    plannerChatTimer = null;
    companyTypeTimer = null;
    if (endingAnimationFrame) window.cancelAnimationFrame(endingAnimationFrame);
    endingAnimationFrame = null;
    endingTransitionTimers.forEach((timer) => window.clearTimeout(timer));
    endingTransitionTimers = [];
  }

  const coreAvatarSlots = { "LUSI_17": 5, "XIAOMAN_21": 1, "小满": 1 };
  const schoolAvatarSlots = {
    "不化": 37, "north_307": 38, "豆沙包不要馅": 39, "机械楼夜行动物": 40, "网信办值班员": 41,
    "北七楼长": 42, "青椒肉丝多一点": 43, "一教302": 44, "树洞搬运工": 45, "旧书摊摊主": 46,
    "南门口等雨": 47, "今天捡到饭卡": 48, "电信院小梁": 49, "十点前一定睡": 50, "图书馆西窗": 51,
    "带走纸箱谢谢": 52, "湖边绕三圈": 53, "橘子不胖": 54, "广播台小周": 55, "第六排靠窗": 56,
    "选课手速零": 57, "VPN又掉了": 58, "饭卡0719": 59, "伞在西门": 60, "卡西欧失主": 61,
    "床头灯泡": 62, "毕业倒计时": 63, "显示器偏蓝": 64, "食堂地图": 25, "东门小卖部": 26,
    "操场边上": 27, "一杯少冰": 28, "纸箱不要扔": 29, "阿鹿": 30, "灰蓝色": 31,
    "一碗热的": 32, "北风吹不到": 33, "加班到九点": 34, "老许不养鱼": 35, "橘子汽水": 36,
    "薄荷冰": 21, "夜班公交": 22, "南门灯坏了": 23, "雨停再走": 24,
  };

  function avatarAtlasPosition(slot) {
    const index = slot - 1;
    return { x: ((index % 8) / 7) * 100, y: (Math.floor(index / 8) / 7) * 100 };
  }

  function avatar(user, compact = false) {
    if (coreAvatarSlots[user]) {
      return `<span class="${compact ? "avatar mini" : "avatar"} avatar-${coreAvatarSlots[user]}" role="img" aria-label="${esc(user)}的头像"></span>`;
    }
    const fallback = (Array.from(String(user)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 64) + 1;
    const position = avatarAtlasPosition(schoolAvatarSlots[user] || fallback);
    return `<span class="${compact ? "avatar mini" : "avatar"} school-atlas-avatar" style="--school-avatar-x:${position.x.toFixed(4)}%;--school-avatar-y:${position.y.toFixed(4)}%" role="img" aria-label="${esc(user)}的头像"></span>`;
  }

  function corruptedLusiAvatar(compact = false) {
    return `<span class="corrupted-lusi-avatar ${compact ? "mini" : ""}" role="img" aria-label="鹭鸶的头像"></span>`;
  }

  function sessionTools() {
    if (state.ending) return "";
    return `<button class="session-reset" type="button" data-action="reset">重新开始</button>`;
  }

  function renderPageCounter(page) {
    const current = PAGE_STEPS.findIndex((step) => step.includes(page)) + 1;
    if (!current) return;
    const counter = document.createElement("div");
    counter.className = "page-counter";
    counter.setAttribute("aria-label", `当前页面 ${current}，共 ${PAGE_STEPS.length} 页`);
    counter.textContent = `${current} / ${PAGE_STEPS.length}`;
    app.appendChild(counter);
  }

  function campusHeader(active = "") {
    const unread = getPmUnread();
    const inboxLabel = unread ? `私信（${unread}）` : "私信";
    const inboxRoute = state.lusiPmStage ? "lusi-messages" : "xiaoman-messages";
    const navItems = [["home", "首页"], ["campus", "校园生活"], ["study", "学习交流"], ["lost", "失物招领"], ["market", "二手市场"], ["settings", "设置"]];
    return `<div class="campus-topline"></div>
      <header class="campus-header"><div class="campus-header-inner">
        <a href="#" class="campus-brand" data-forum-section="home"><span class="campus-seal">梧</span><span><b>梧桐大学校园服务中心</b><small>WUTONG UNIVERSITY CAMPUS SERVICE</small></span></a>
        <div class="campus-user">12,483人在线　访客　<a class="auth-service-link" href="#" data-route="network">统一身份认证服务</a>　<a class="inbox-link" href="#" data-route="${inboxRoute}">${inboxLabel}</a>　<a href="#" data-forum-section="settings">设置</a></div>
      </div></header>
      <div class="campus-mobile-actions"><a class="auth-service-link" href="#" data-route="network">统一身份认证服务</a><a class="inbox-link" href="#" data-route="${inboxRoute}">${inboxLabel}</a></div>
      <nav class="campus-nav"><div>${navItems.map(([id, label]) => `<a class="${active === id ? "active" : ""} ${id === "settings" ? "nav-settings" : ""}" href="#" data-forum-section="${id}">${label}</a>`).join("")}</div></nav>
      <div class="campus-search-dock"><form data-campus-global-search><label class="sr-only" for="campus-global-q">搜索校内服务</label><input id="campus-global-q" name="q" value="${esc(state.forumQuery)}" placeholder="搜索校内服务、帖子或错误代码" autocomplete="off"><button>搜索</button></form></div>`;
  }

  function campusFooter() {
    return `<footer class="campus-footer"><a href="#" data-forum-section="home">校园服务首页</a>　·　<a href="#" data-route="forum-search">站内搜索</a>　·　服务联系　·　隐私说明<br>明ICP备20210321号-2　© 2006—2026 梧桐大学</footer>`;
  }

  function renderNetwork() {
    document.title = state.networkFixed ? "认证成功 - 梧桐大学" : "校园网认证 - 梧桐大学";
    const returnPage = state.networkReturnPage || (state.fixKnown ? "campus-thread" : "");
    const returnLabel = state.networkReturnLabel || (state.fixKnown ? "返回刚才的帖子" : "");
    const returnLink = returnPage ? `<a class="secondary-link network-return-link" href="#" data-route="${returnPage}">← ${returnLabel}</a>` : "";
    const body = state.networkFixed ? `
      <div class="network-status success"><span>✓</span><div><h1>校园网认证成功</h1><p>当前设备已连接互联网。</p></div></div>
      <dl class="network-details"><div><dt>连接状态</dt><dd>CONNECTED</dd></div><div><dt>认证节点</dt><dd>NORTH-DORM-07</dd></div><div><dt>设备名称</dt><dd>WT-BOOK-23</dd></div></dl>
      <div class="network-actions"><a class="primary-button" href="#" data-route="${returnPage || "campus-thread"}">${returnLabel || "返回刚才的帖子"}</a><a class="secondary-link" href="#" data-route="lusi-messages">${getPmUnread() ? `私信（${getPmUnread()}）` : "私信"}</a></div>` : `
      <div class="network-status failure"><span>!</span><div><h1>无法完成校园网认证</h1><p>当前设备未能通过统一身份认证，暂时无法访问互联网。校内服务仍可使用。</p></div></div>
      <dl class="network-details"><div><dt>连接状态</dt><dd>AUTH_FAILED</dd></div><div><dt>错误代码</dt><dd><strong>E403</strong></dd></div><div><dt>认证节点</dt><dd>NORTH-DORM-07</dd></div><div><dt>发生时间</dt><dd>${new Date().toLocaleString("zh-CN", { hour12: false })}</dd></div></dl>
      ${state.fixKnown ? `<form id="auth-form" class="auth-form"><label for="device-name">设备名称</label><div><input id="device-name" name="device" value="${esc(state.deviceName)}" autocomplete="off"><button type="submit">重新认证</button></div><p id="auth-note">请确认设备名称后重新连接。</p></form><div class="network-actions network-return-actions">${returnLink}</div>` : `<div class="network-actions"><a class="primary-button" href="#" data-route="forum-home">校内服务</a>${returnLink}<span>信息化中心值班电话：6403-2190</span></div>`}`;

    app.innerHTML = `${sessionTools()}<div class="network-page"><header><div><strong>梧桐大学校园网络</strong><span>统一身份认证服务</span></div></header><main><section class="network-card"><div class="card-title">网络连接</div><div class="network-body">${body}</div></section></main></div>`;

    document.querySelector("#auth-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("device")?.toString() || "";
      state.deviceName = value;
      if (value === "WT-BOOK-23") {
        state.networkFixed = true;
        state.lusiPmStage = Math.max(1, Number(state.lusiPmStage) || 0);
        state.pmContact = "lusi";
        setPmUnread("lusi", 1);
        saveState();
        renderNetwork();
      } else {
        const note = document.querySelector("#auth-note");
        if (note) note.textContent = "认证失败：设备名称仍包含无效字符。";
      }
    });
  }

  function renderForumHome() {
    const section = state.forumSection || "home";
    const boards = {
      home: { label: "服务中心首页", title: "今日信息", stat: "今日更新：328　累计主题：64,102", rows: [
        ["关于北区宿舍网络认证维护的通知", "校园公告", "今天 20:30", 0],
        ["东门食堂二楼窗口换位置了吗", "校园生活", "今天 18:42", 12],
        ["求借一本《数字信号处理》第四版", "学习交流", "今天 17:09", 3],
        ["北区捡到一串钥匙，挂着蓝色门禁扣", "失物招领", "今天 15:26", 7],
        ["出九成新折叠桌，北七自提", "二手市场", "今天 13:51", 5],
      ]},
      campus: { label: "校园生活", title: "校园生活", stat: "今日新帖：86　在线：3,214", rows: [
        ["东门食堂二楼窗口换位置了吗", "食堂与生活", "今天 18:42", 12],
        ["南湖现在还有那种脚踏船吗", "校内活动", "今天 17:55", 9],
        ["北七楼下那只橘猫有人喂过吗", "宿舍区", "今天 16:20", 18],
        ["操场今晚是不是有社团彩排", "校园活动", "今天 14:03", 6],
      ]},
      study: { label: "学习交流", title: "学习交流", stat: "今日新帖：41　资料帖：8,731", rows: [
        ["求借一本《数字信号处理》第四版", "教材求助", "今天 17:09", 3],
        ["一教302今晚有人上课吗", "自习信息", "今天 16:41", 5],
        ["选修课《影像文化》期末形式", "课程交流", "今天 12:28", 14],
        ["图书馆数据库校外访问方法", "资料共享", "昨天 22:16", 21],
      ]},
      lost: { label: "失物招领", title: "失物招领", stat: "待认领：27　今日归还：11", rows: [
        ["北区捡到一串钥匙，挂着蓝色门禁扣", "北七门口", "今天 15:26", 7],
        ["三食堂饭卡，尾号0719", "三食堂", "今天 13:08", 2],
        ["寻黑色折叠伞，伞柄贴了白胶布", "图书馆", "今天 10:34", 4],
        ["捡到计算器一台，二教门口", "第二教学楼", "昨天 19:47", 6],
      ]},
      market: { label: "二手市场", title: "二手市场", stat: "今日发布：63　交易中：214", rows: [
        ["出九成新折叠桌，北七自提", "宿舍用品", "今天 13:51", 5],
        ["收一盏夹床头的小台灯", "求购", "今天 12:14", 8],
        ["毕业出书架、衣架和收纳箱", "毕业清仓", "今天 09:22", 16],
        ["出24寸显示器，已过保", "数码产品", "昨天 23:06", 11],
      ]},
    };
    document.title = `${section === "settings" ? "设置" : (boards[section]?.label || "首页")} - 梧桐大学校园服务中心`;
    if (section === "settings") {
      app.innerHTML = `${sessionTools()}<div class="campus-shell">${campusHeader("settings")}<main class="campus-content"><p class="crumb"><a href="#" data-forum-section="home">服务中心首页</a> &gt; 个人设置</p><form id="campus-settings" class="settings-panel"><header><h1>个人设置</h1><p>当前身份：访客1283</p></header><label><span>站内消息提醒</span><select name="notice"><option>仅私信</option><option>私信和回复</option><option>全部关闭</option></select></label><label class="check-row"><input type="checkbox" name="compact" checked><span>使用紧凑帖子列表</span></label><label class="check-row"><input type="checkbox" name="online"><span>隐藏在线状态</span></label><div><button type="submit">保存设置</button><span id="settings-note">${state.forumSettingsSaved ? "设置已保存。" : ""}</span></div></form></main>${campusFooter()}</div>`;
      document.querySelector("#campus-settings")?.addEventListener("submit", (event) => {
        event.preventDefault();
        state.forumSettingsSaved = true;
        saveState();
        document.querySelector("#settings-note").textContent = "设置已保存。";
      });
      return;
    }
    const board = boards[section] || boards.home;
    app.innerHTML = `${sessionTools()}<div class="campus-shell">${campusHeader(section)}<main class="campus-content"><p class="crumb">${board.label}</p><div class="board-title"><h1>${board.title}</h1><span>${board.stat}</span></div><section class="board-list">${board.rows.map((r) => `<article><div><a href="#" data-action="decoy" data-title="${esc(r[0])}">${r[0]}</a><p>${r[1]} · 最后回复 ${r[2]}</p></div><span>${r[3]} 回复</span></article>`).join("")}</section></main>${campusFooter()}</div>`;
  }

  function searchResults(query) {
    if (!/e?403/i.test(query)) return [];
    return [
      ["宿舍自购路由器设置经验", "校园生活 · 小满（你的好友） · 2026-06-14 · 31条回复", "北区七栋信号确实差。给对象装了个自购路由，认证基本不掉线。", "xiaoman-router"],
      ["北区校园网隔几分钟掉一次，有人遇到吗？", "校园生活 · 最后回复：LUSI_17 · 今天22:41 · 17条回复", "北区统一认证维护……客户端提示E403。", true],
    ];
  }

  function renderForumSearch() {
    document.title = "搜索 - 梧桐大学校园服务中心";
    const results = searchResults(state.forumQuery);
    const content = !state.forumQuery ? `<p class="search-empty">请输入关键词或错误代码。</p>` : results.length ? `<p class="search-count">找到约 ${results.length} 条与“${esc(state.forumQuery)}”相关的内容</p><section class="search-results">${results.map((r) => `<article><a href="#" class="${r[3] === "xiaoman-router" ? "familiar-user" : ""}" ${r[3] === true ? `data-route="campus-thread"` : r[3] === "xiaoman-router" ? `data-route="xiaoman-router"` : `data-action="decoy" data-title="${esc(r[0])}"`}>${r[0]}</a><small>${r[1]}</small><p>${r[2].replace(/E403/gi, "<mark>E403</mark>")}</p></article>`).join("")}</section>` : `<p class="search-empty">没有找到与“${esc(state.forumQuery)}”相关的内容。</p>`;
    app.innerHTML = `${sessionTools()}<div class="campus-shell">${campusHeader()}<main class="campus-content"><p class="crumb"><a href="#" data-forum-section="home">服务中心首页</a> &gt; 站内搜索</p>${content}</main>${campusFooter()}</div>`;
  }

  function forumPost(user, time, floor, text, extra = "") {
    const profileRoute = user === "小满" ? "xiaoman-profile" : user === "LUSI_17" ? "lusi-profile" : "";
    const avatarMarkup = profileRoute ? `<a class="forum-avatar-link" href="#" data-route="${profileRoute}" aria-label="查看${esc(user)}的个人主页">${avatar(user)}</a>` : avatar(user);
    const friend = user === "小满" ? `<span class="friend-badge">（你的好友）</span>` : "";
    const nameMarkup = profileRoute ? `<a class="forum-name forum-name-link" href="#" data-route="${profileRoute}" title="进入${esc(user)}的个人主页">${esc(user)}${friend}<small class="profile-entry-keyword">个人主页</small></a>` : `<span class="forum-name">${esc(user)}${friend}</span>`;
    return `<article class="forum-post"><aside>${avatarMarkup}${nameMarkup}<span>普通用户</span></aside><div><span class="floor">${floor}</span><time>发表于 ${time}</time><div class="forum-post-text">${text}</div>${extra}</div></article>`;
  }

  function renderCampusThread() {
    state.fixKnown = true;
    saveState();
    document.title = "北区校园网隔几分钟掉一次 - 梧桐大学校园服务中心";
    const backPage = state.forumReturnPage || "forum-search";
    const backLabel = state.forumReturnLabel || "返回搜索结果";
    const lusiText = state.networkFixed ? `不是欠费。先把旧客户端彻底退出，再到<a class="network-fix-link" href="#" data-route="network">校园网认证页</a>把设备名最后的空格删掉，重新认证就行。<p class="edit-note">编辑于刚刚：设备名末尾的空格很难看出来，我那次也是这样。</p>` : `不是欠费。先把旧客户端彻底退出，再到<a class="network-fix-link" href="#" data-route="network">校园网认证页</a>把设备名最后的空格删掉，重新认证就行。`;
    app.innerHTML = `${sessionTools()}<div class="campus-shell">${campusHeader("campus")}<main class="campus-content"><p class="crumb"><a href="#" data-route="${backPage}">← ${backLabel}</a>　&gt; 校园生活</p><div class="thread-heading"><h1>北区校园网隔几分钟掉一次，有人遇到吗？</h1><p>浏览：482　回复：17</p></div>${forumPost("north_307", "2021-09-18 22:41", "1楼", "北区宿舍，今晚校园网隔十分钟左右就掉一次，客户端提示E403。手机和电脑都一样。有人遇到吗？")}${forumPost("豆沙包不要馅", "2021-09-18 22:44", "2楼", "北区吗？北区今晚统一认证维护。")}${forumPost("机械楼夜行动物", "2021-09-18 22:46", "3楼", "把客户端退干净再连，别同时开路由器。我刚才也是。")}${forumPost("LUSI_17", "今天 22:41", "17楼", lusiText, `<div class="signature">我们都会安然无恙。</div>`)}<div class="thread-actions single"><a href="#" data-route="${backPage}">${backLabel}</a></div></main>${campusFooter()}</div>`;
  }

  const decoyThreads = {
    "关于9月校园网络例行维护的通知": { section: "校园公告", views: "2,614", posts: [["网信办值班员", "2025-09-05 09:00", "1楼", "9月6日凌晨0:30至2:00进行认证系统例行维护。期间东区教学楼与部分宿舍可能出现短时断线，维护结束后会自动恢复。"], ["一教302", "2025-09-05 09:18", "2楼", "图书馆校外访问也会受影响吗？"], ["网信办值班员", "2025-09-05 09:31", "3楼", "不影响数据库校外访问，只影响统一认证的新登录。"]]},
    "客户端出现403是账号欠费吗？": { section: "新生问答", views: "389", posts: [["十点前一定睡", "2024-08-29 21:07", "1楼", "客户端一直弹E403，但缴费页面显示余额正常。这个是欠费吗？"], ["电信院小梁", "2024-08-29 21:15", "2楼", "不是。网页的HTTP 403和认证客户端的E403也不是一个东西。先看报错下面有没有设备名。"], ["北七楼长", "2024-08-29 21:42", "4楼", "去年遇到过一次，是设备名末尾多了空格。删掉后重新认证就好了。"]]},
    "北区7栋网络又断了？": { section: "校园生活", views: "716", posts: [["北七楼长", "2022-05-26 19:43", "1楼", "七栋三层和四层都断了吗？群里已经有十几个人问了。"], ["青椒肉丝多一点", "2022-05-26 19:49", "2楼", "五层也断，手机连热点正常，应该不是账号问题。"], ["南门口等雨", "2022-05-26 20:06", "5楼", "刚问过宿管，一楼弱电间跳闸，师傅已经来了。"], ["北七楼长", "2022-05-26 20:28", "8楼", "已恢复。"]]},
    "统一身份认证错误代码汇总": { section: "学习交流", views: "4,901", posts: [["电信院小梁", "2023-03-14 11:20", "1楼", "整理一下最近常见的客户端提示：E201一般是密码错误，E302多见于重复在线，E403优先检查设备名和所在认证节点。代码会复用，最终还是以客户端下面的说明为准。"], ["图书馆西窗", "2023-03-14 12:01", "6楼", "补一个：改过校园卡密码以后，旧客户端不会自动同步，需要退出账号重新登录。"], ["树洞搬运工", "2023-03-15 08:46", "11楼", "东区的E403有时是维护，不一定都是设备名。"]]},
    "东门食堂二楼窗口换位置了吗": { section: "校园生活", views: "641", posts: [["青椒肉丝多一点", "今天 18:42", "1楼", "原来卖面的窗口是不是挪到最南边了？我绕了一圈没看见。"], ["今天捡到饭卡", "今天 18:51", "3楼", "对，和盖饭窗口对调了，价目表还没换。"], ["南门口等雨", "今天 19:06", "7楼", "阿姨说下周会把牌子重新挂上。"]]},
    "关于北区宿舍网络认证维护的通知": { section: "校园公告", views: "3,821", posts: [["网信办值班员", "今天 08:30", "1楼", "北区宿舍统一认证节点将于今晚23:30进行维护，预计持续二十分钟。已登录设备不受影响，新设备可能需要重新认证。"], ["北七楼长", "今天 08:46", "2楼", "七栋走廊里的自助打印机算新设备吗？今晚有同学赶材料。"], ["网信办值班员", "今天 09:02", "4楼", "打印机走校内专网，不在本次维护范围内。"]]},
    "求借一本《数字信号处理》第四版": { section: "学习交流", views: "203", posts: [["一教302", "今天 17:09", "1楼", "临时要对两道课后题，借一晚就行，明天中午还。"], ["电信院小梁", "今天 17:24", "2楼", "我有第三版，不确定页码是否一样，需要的话私信。"], ["图书馆西窗", "今天 17:39", "3楼", "四版在南区书库还有一本馆藏，刚查过。"]]},
    "北区捡到一串钥匙，挂着蓝色门禁扣": { section: "失物招领", views: "188", posts: [["今天捡到饭卡", "今天 15:26", "1楼", "北七到食堂的小路上捡到，两把钥匙，蓝色门禁扣，已经交给北七值班室，登记在第二页最下面。"], ["北七楼长", "今天 15:44", "2楼", "我转进楼栋群了。失主去拿的时候记得说清钥匙数量，值班阿姨会核对。"], ["带走纸箱谢谢", "今天 16:12", "5楼", "是我室友的那串，门禁扣背面有道划痕，刚刚已经领回。"]]},
    "出九成新折叠桌，北七自提": { section: "二手市场", views: "257", posts: [["带走纸箱谢谢", "今天 13:51", "1楼", "去年九月买的，桌面有一处不明显的划痕。35元，北七一楼自提，晚上九点以后方便。"], ["旧书摊摊主", "今天 14:07", "2楼", "桌腿能完全折平吗？想塞床底。"], ["带走纸箱谢谢", "今天 14:12", "3楼", "可以，折起来大概五厘米厚。"]]},
    "南湖现在还有那种脚踏船吗": { section: "校园生活", views: "534", posts: [["湖边绕三圈", "今天 17:55", "1楼", "周末想带家里人去南湖，去年东门那排双人脚踏船现在还租吗？公众号只写了游船。"], ["橘子不胖", "今天 18:07", "2楼", "还有，但只剩四人船，押金要现金或者校园卡。下午五点半以后不再放船。"], ["小满", "今天 19:32", "9楼", "上个月去过一次，东门售票亭旁边那块价目表被树挡住了，走近才能看见。"]]},
    "北七楼下那只橘猫有人喂过吗": { section: "校园生活", views: "1,208", posts: [["橘子不胖", "今天 16:20", "1楼", "右耳有个小缺口、尾巴很粗的那只。它今天一直蹲在自行车棚下面，我放了半碗水，没敢乱喂。"], ["小区猫观察员", "今天 16:47", "4楼", "叫铜锣，已经绝育。它在六栋和七栋之间来回串，不用每天喂，保洁阿姨那里有猫粮。"], ["床头灯泡", "今天 17:03", "7楼", "原来叫铜锣……我一直叫它大橘。下雨天会自己躲进北门值班室。"]]},
    "操场今晚是不是有社团彩排": { section: "校园生活", views: "416", posts: [["操场边上", "今天 14:03", "1楼", "刚路过看到主席台在拉线，今晚还能跑步吗？"], ["广播台小周", "今天 14:18", "2楼", "是迎新晚会联排，内圈六点半到九点封，外圈照常开放。音响试声可能会比较响。"], ["一杯少冰", "今天 20:11", "6楼", "外圈现在也被器材车占了一小段，跑到西南角要绕一下。"]]},
    "一教302今晚有人上课吗": { section: "学习交流", views: "177", posts: [["第六排靠窗", "今天 16:41", "1楼", "课表上显示空教室，想和组员排练答辩，大概用到八点。有人临时借过了吗？"], ["一教302", "今天 16:58", "2楼", "七点有学院讲座，门口纸质安排表没更新。旁边304今晚是空的，不过投影遥控在讲台抽屉里。"]]},
    "选修课《影像文化》期末形式": { section: "学习交流", views: "693", posts: [["选课手速零", "今天 12:28", "1楼", "补选刚进去，前两周都没听到。期末是闭卷还是交片？课程群二维码已经过期了。"], ["灰蓝色", "今天 12:43", "3楼", "三到五分钟短片，小组最多四人，还要交一份个人阐释。老师说纯剪辑素材库不算原创。"], ["阿鹿", "今天 13:06", "8楼", "我把新群码发私信了。下周课上要先报选题，不用做完整提案。"]]},
    "图书馆数据库校外访问方法": { section: "学习交流", views: "2,104", posts: [["VPN又掉了", "昨天 22:16", "1楼", "校外访问知网总是跳回登录页。新版入口到底走统一认证还是客户端VPN？"], ["图书馆西窗", "昨天 22:29", "2楼", "从图书馆首页右上角“校外访问”进，不要先打开知网。浏览器如果记过旧代理地址，清一下站点缓存。"], ["电信院小梁", "昨天 23:02", "11楼", "手机浏览器容易把认证页拦成弹窗，换系统浏览器就能过。"]]},
    "三食堂饭卡，尾号0719": { section: "失物招领", views: "96", posts: [["饭卡0719", "今天 13:08", "1楼", "靠近饮料柜的四人桌下面捡到，卡面贴着一张褪色的柴犬贴纸。交给一楼充卡窗口了。"], ["食堂地图", "今天 13:33", "2楼", "失主刚在表白墙留言，名字姓周。我把这个帖子截图发过去了。"]]},
    "寻黑色折叠伞，伞柄贴了白胶布": { section: "失物招领", views: "143", posts: [["伞在西门", "今天 10:34", "1楼", "昨晚十点左右落在图书馆一楼自助借还机旁，黑色八骨伞，伞柄缠了一圈白色医用胶布。伞不值钱，但里面夹着一张拍立得。"], ["图书馆西窗", "今天 11:02", "3楼", "保洁今早收了两把黑伞，放在总服务台左侧的伞筐里。拍立得最好当面核对。"], ["伞在西门", "今天 12:17", "4楼", "找到了，照片还在伞套夹层里。"]]},
    "捡到计算器一台，二教门口": { section: "失物招领", views: "121", posts: [["卡西欧失主", "昨天 19:47", "1楼", "二教西门台阶上捡到一台灰色科学计算器，背面用黑笔写了三个英文字母。先放在二教105值班室。"], ["第六排靠窗", "昨天 20:25", "2楼", "可能是我们班同学的，他下午考完概率论后找过。我让他带学生证去值班室。"]]},
    "收一盏夹床头的小台灯": { section: "二手市场", views: "214", posts: [["床头灯泡", "今天 12:14", "1楼", "收一个能夹床栏的小灯，暖光最好，亮度不用太高。北区宿舍自提，预算二十以内。"], ["一碗热的", "今天 12:46", "3楼", "我有个米白色三档的，夹子有点掉漆但灯没问题。今晚回宿舍拍给你看。"], ["床头灯泡", "今天 13:01", "4楼", "可以，夹口宽度麻烦一起拍一下，我床栏比较粗。"]]},
    "毕业出书架、衣架和收纳箱": { section: "二手市场", views: "512", posts: [["毕业倒计时", "今天 09:22", "1楼", "木纹小书架15，落地衣架20，透明收纳箱两个一共18。都用了两年，有正常磨损，南五四楼自提，打包带走50。"], ["纸箱不要扔", "今天 09:48", "2楼", "书架背板是钉死的吗？想拆开搬去北区。"], ["毕业倒计时", "今天 10:03", "5楼", "背板六颗小螺丝，可以拆。我这边有工具，晚上来拿可以帮你拆好。"]]},
    "出24寸显示器，已过保": { section: "二手市场", views: "467", posts: [["显示器偏蓝", "昨天 23:06", "1楼", "24寸1080P，买了三年，右下角有一处很轻的漏光，纯黑画面才能看见。带电源线和HDMI，260元。"], ["加班到九点", "昨天 23:24", "2楼", "能接电脑现场验吗？主要想看坏点和接口。"], ["显示器偏蓝", "昨天 23:41", "6楼", "可以，宿舍有笔记本和测试图。周四晚上九点后都在。"]]},
  };

  function renderForumDecoy() {
    const title = state.decoyTitle || "校园生活随手记";
    document.title = `${title} - 梧桐大学校园服务中心`;
    const thread = decoyThreads[title] || { section: "校园生活", views: "126", posts: [["树洞搬运工", "昨天 19:22", "1楼", "楼主把标题里的地点补一下吧，同名的活动这周有两个。"], ["雨停再走", "昨天 19:38", "2楼", "如果说的是东门那场，海报已经挪到食堂入口了。"]] };
    const backPage = state.forumReturnPage || "forum-home";
    const backLabel = state.forumReturnLabel || "返回校园服务首页";
    app.innerHTML = `${sessionTools()}<div class="campus-shell">${campusHeader()}<main class="campus-content"><p class="crumb"><a href="#" data-route="${backPage}">← ${backLabel}</a>　&gt; ${thread.section}</p><div class="thread-heading"><h1>${esc(title)}</h1><p>浏览：${thread.views}　回复：${thread.posts.length}</p></div>${thread.posts.map((post) => forumPost(...post)).join("")}<div class="thread-actions single"><a href="#" data-route="${backPage}">${backLabel}</a></div></main>${campusFooter()}</div>`;
  }

  function xiaomanAtlas(tile, className = "") {
    return `<div class="xiaoman-atlas xiaoman-tile-${tile} ${className}" role="img" aria-label="用户上传的生活照片"></div>`;
  }

  function xiaomanAlbumAtlas(tile, className = "") {
    return `<div class="xiaoman-album-atlas xiaoman-album-tile-${tile} ${className}" role="img" aria-label="小满的相册照片"></div>`;
  }

  function renderXiaomanRouterThread() {
    document.title = "宿舍自购路由器设置经验 - 梧桐大学校园服务中心";
    const body = `北区七栋信号确实差。给对象装了个自购路由，认证基本不掉线。设置要点：别开双频合一，信道选11，客户端用学校旧版。<div class="forum-photo-row">${xiaomanAtlas(2)}${xiaomanAtlas(3)}</div>`;
    const backPage = state.forumReturnPage || "forum-search";
    const backLabel = state.forumReturnLabel || "返回搜索结果";
    app.innerHTML = `${sessionTools()}<div class="campus-shell">${campusHeader("campus")}<main class="campus-content"><p class="crumb"><a href="#" data-route="${backPage}">← ${backLabel}</a>　&gt; 校园生活</p><div class="thread-heading"><h1>宿舍自购路由器设置经验</h1><p>浏览：1,206　回复：31</p></div>${forumPost("小满", "2026-06-14 21:18", "1楼", body, `<div class="signature">开心每一天。</div>`)}${forumPost("小满", "2026-06-14 21:20", "2楼", "对象住北七，实测有用。有问题可以私我。")}${forumPost("机械楼夜行动物", "2026-06-14 21:36", "3楼", "信道11在我这边也比自动稳定，补充一下别把校园网账号写进路由后台。")}${forumPost("豆沙包不要馅", "2026-06-14 22:04", "4楼", "旧客户端现在还能下吗？")}<div class="thread-actions single"><a href="#" data-route="${backPage}">${backLabel}</a></div></main>${campusFooter()}</div>`;
  }

  function xiaomanProfileNav(active) {
    return `<nav class="profile-nav">${[["home", "主页"], ["logs", "日志"], ["album", "相册"], ["guest", "留言"]].map(([id, label]) => `<a href="#" class="${active === id ? "active" : ""}" data-xiaoman-tab="${id}">${label}</a>`).join("")}</nav>`;
  }

  function renderXiaomanProfile() {
    document.title = "小满 - 梧桐大学校园服务中心";
    const tab = state.xiaomanTab === "posts" ? "home" : (state.xiaomanTab || "home");
    if (state.xiaomanTab === "posts") {
      state.xiaomanTab = "home";
      saveState();
    }
    let content = "";
    if (tab === "home") {
      content = `<section class="profile-panel"><h2>最近动态</h2><p><time>今天 19:32</time>　回复了《南湖现在还有那种脚踏船吗》</p><p><time>今天 18:10</time>　更新了相册“随手拍”</p><div class="profile-note recent-visitors"><b>最近访客</b>${avatar("不化", true)}${avatar("豆沙包不要馅", true)}${avatar("机械楼夜行动物", true)}<span>今天 21:06</span></div></section>`;
    } else if (tab === "posts") {
      content = `<section class="profile-panel"><h2>TA的帖子</h2><p><a href="#" data-route="xiaoman-router">宿舍自购路由器设置经验</a><small>2026-06-14 · 校园生活</small></p><p><b>南湖现在还有那种脚踏船吗</b><small>2026-04-20 · 想带对象去坐一次。上次去没排上。</small></p><p><b>校园云盘同步失败求助</b><small>2026-05-03 · pan客户端一直同步失败，清缓存也没用，有没有人知道怎么解决？</small></p><p><b>出二手显示器（已出）</b><small>23.8寸，宿舍自提。</small></p></section>`;
    } else if (tab === "logs") {
      content = `<section class="log-list"><div class="log-list-head"><h2>日志</h2><span>1</span></div><article><div><a href="#" data-route="xiaoman-blog">第一次见面</a><p>2025年9月20日　阅读 37</p></div><span class="public-state">公开</span></article></section>`;
    } else if (tab === "album") {
      content = `<section class="profile-panel"><h2>随手拍 <small>3张</small></h2><div class="xiaoman-album-grid"><div class="album-photo album-photo-static">${xiaomanAlbumAtlas(1)}<span>换了个头像</span><small>今天 18:10</small></div><div class="album-photo album-photo-static">${xiaomanAlbumAtlas(2)}<span>南湖边</span><small>9月20日</small></div><div class="album-photo album-photo-static">${xiaomanAlbumAtlas(4)}<span>又到一点了</span><small>5月27日</small></div></div><p class="album-caption">基本都是别人随手拍的。</p></section>`;
    } else {
      content = `<section class="profile-panel guestbook"><h2>留言</h2><article>${avatar("不化", true)}<div><b>不化</b><time>2026-03-14 15:02</time><p>小满，你上学期那个网盘链接再发我一下，我换电脑找不到了。</p></div></article><article>${avatar("小满", true)}<div><b>小满</b><time>2026-03-14 15:09</time><p><a href="#" data-route="cloud">pan.wutong.edu.cn/s/xiaoman_3f2</a>。密码是我和初恋第一次见面的地方，你自己猜。</p></div></article><article>${avatar("不化", true)}<div><b>不化</b><time>2026-03-14 15:11</time><p>？我怎么知道</p></div></article></section>`;
    }
    const backPage = state.profileReturnPage || "forum-home";
    const backLabel = state.profileReturnLabel || "返回校园服务首页";
    app.innerHTML = `${sessionTools()}<div class="campus-shell">${campusHeader()}<main class="campus-content"><p class="crumb"><a href="#" data-route="${backPage}">← ${backLabel}</a>　&gt; 用户空间</p><section class="profile-card xiaoman-card">${avatar("XIAOMAN_21")}<div><h1>小满 <span class="profile-friend">（你的好友）</span> <small>@XIAOMAN_21</small></h1><p>UID：39277　注册：2023-09-01　最后访问：刚刚</p><p class="profile-sign">开心每一天。</p></div><dl><div><dt>主题</dt><dd>7</dd></div><div><dt>回复</dt><dd>89</dd></div><div><dt>日志</dt><dd>1</dd></div></dl></section>${xiaomanProfileNav(tab)}${content}<div class="profile-contact"><a href="#" data-route="xiaoman-messages">发送私信</a></div></main>${campusFooter()}</div>`;
    document.querySelectorAll("[data-xiaoman-tab]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      state.xiaomanTab = event.currentTarget.dataset.xiaomanTab;
      saveState();
      renderXiaomanProfile();
    }));
  }

  function renderXiaomanBlog() {
    document.title = "第一次见面 - 小满的日志";
    const entry = `<article class="blog-entry"><header><h1>第一次见面</h1><p>2025年9月20日　星期六　晴　阅读 37</p></header><p>南湖公园东门。我比约定的时间早到了半小时，在门外的长椅上坐下来，把准备好的开场白一句一句在心里过。</p><p>ta来的时候，风正从湖面上过来。我们沿着湖走，一圈，又一圈。我原本以为自己会紧张，会找话，会留意每一步该隔多远——结果什么都没有，ta的笑容让我感到莫名其妙的放松。</p><p>回去的路上，路灯一盏一盏亮起来，把两个人的影子投在地上。</p><p>我不再说话，ta也没有。</p><footer><a href="#" data-route="xiaoman-profile">返回日志列表</a></footer></article>`;
    app.innerHTML = `${sessionTools()}<div class="blog-page xiaoman-blog"><header class="blog-header"><div><a href="#" data-route="xiaoman-profile">小满的日志</a><span>XIAOMAN_21 的个人空间</span></div><nav><a href="#" data-route="xiaoman-profile">主页</a><a href="#" data-route="xiaoman-messages">私信</a></nav></header><main class="blog-main">${entry}</main><footer class="blog-footer">Powered by OldSpace 3.2　© XIAOMAN_21</footer></div>`;
  }

  function renderXiaomanPhoto() {
    const photos = [
      { tile: 1, title: "换了个头像", caption: "宿舍镜子有点脏，懒得擦了。", time: "上传于今天 18:10" },
      { tile: 2, title: "南湖边", caption: "不化抓拍的。我说这张眼睛都没看镜头，他说这样才像我。", time: "上传于2025年9月20日" },
      { tile: 4, title: "又到一点了", caption: "报告没写完，咖啡先喝完了。", time: "上传于2026年5月27日" },
    ];
    const index = Math.min(3, Math.max(1, Number(state.xiaomanPhoto) || 1));
    const photo = photos[index - 1];
    document.title = `${photo.title} - 小满的相册`;
    app.innerHTML = `${sessionTools()}<div class="photo-viewer"><header><a href="#" data-route="xiaoman-profile">← 返回小满的相册</a><span>${index} / ${photos.length}</span></header><main>${xiaomanAlbumAtlas(photo.tile, "photo-large")}<section><h1>${photo.title}</h1><p>${photo.caption}</p><small>${photo.time}</small></section></main></div>`;
  }

  const cloudTexts = {
    "使用说明.txt": `澄明伴聊 个人版 · 使用备忘\n\n1. 收到消息先跑模型，别手滑直接回。\n2. v3 别在吵架时用，道歉太顺，显得假。\n3. 宝宝难过的时候用 v2。v3 会讲道理。\n4. 纪念日、生日，提前三天生成，自己改一遍再发。\n5. 有些事，还是得自己回。\n\n（2026.09.02 伴聊 v3 推送，模型已更新。配置见 语气配置.json）`,
    "语气配置.json": `{"product":"澄明伴聊 3.2 · 个人版","model":"chat_model_v3_lora.pt","style":{"温柔":0.8,"幽默":0.3,"吃醋":0.1,"讲道理":0.2,"道歉":"即时"},"称呼":"宝宝","作息":"晚睡，消息集中在 22:00 之后","雷区":["提体重","提前任","说'随便你'"]}`,
    "整理说明.txt": `聊天记录格式：{role, text, time}\nuser = 宝宝的消息，原样复制，一个字不改。\nassistant = 我的回复，按模型版本标注；没有模型标注的就是我自己写的。\n人工改过的，加 "edited": true。\n\n2026-03 之前的记录从旧手机导出，时间缺失的部分跳过。\n吵架的记录单独放一个目录，训练时加倍权重。`,
    "聊天记录_全量.jsonl": `文件过大，仅显示前10条，共47,283条\n\n{"role":"user","text":"刚出宿舍楼，风好大。","time":"2025-11-02 08:12"}\n{"role":"assistant","text":"多穿点，你昨晚还咳嗽。","time":"2025-11-02 08:15","model":"chat_v1"}\n{"role":"user","text":"我是不是真的很差劲，连这个都做不好。","time":"2026-05-14 23:41"}\n{"role":"assistant","text":"不是的。你只是太累了。别人看到结果，没看到你熬到现在的样子。","time":"2026-05-14 23:44","model":"chat_v2"}\n{"role":"user","text":"我快没信心了，再考不上怎么办。","time":"2026-06-30 02:03"}\n{"role":"assistant","text":"考不上就再来一次。我陪着你。你不需要一次就赢。","time":"2026-06-30 02:06","model":"chat_v2"}\n{"role":"user","text":"你就是觉得我烦了对吧。","time":"2026-04-05 22:58"}\n{"role":"assistant","text":"我没有觉得你烦。是我今天太急了，话赶话。你烦我我都不会烦你。","time":"2026-04-05 23:01","model":"chat_v2"}\n{"role":"user","text":"你今天是不是心情不好？","time":"2026-09-06 21:22"}\n{"role":"assistant","text":"没有，就是实验数据不好看。别担心我。","time":"2026-09-06 21:40","model":"chat_v3","edited":true}`,
    "d0902-3.txt": `【9月2日 21:58 发送】\n今天答辩是挺熬人的，换谁都虚。\n晚上早点睡，明天我去南门买你爱吃的。\n（ta今天提到“答辩”和“没睡好”，v3 抓关键词生成的。这条我一个字没改。）`,
    "d0916-1.txt": `【今晚 22:40 · 论坛私信】\n我刚回宿舍，就看到通知说北七今晚认证维护。你那边网还好吗？断了先别急，我查查。\n（改：把“我刚回宿舍”换成“我也刚看到通知”，更像真人。）`,
    "d0916-2.txt": `【今晚 22:50 · 论坛私信】\n维护好像结束了。你试试重新认证，还不行的话，等我实验做完去你楼下。\n（关心到了就行。）`,
    "d0916-3.txt": `【今晚 23:0x · 论坛私信】\n刚做完实验。这么晚还不睡？\n（ta主动发消息，v3 跑了一下，这句可以。）`,
    "告白_v2_最终.txt": `【2026-05-20 20:14 发送 · v2 最终版】\n我嘴笨，所以把话说慢一点。\n认识你以后，我每天最盼着的事就是手机响。\n如果以后每天都能这样，我想贪心一点——\n做我对象，好不好。\n（v1 太文艺。v2 前后改过四版，这版刚好。）`,
    "生日祝福_2026.txt": `【生日当天 00:00 定时发送】\n生日快乐，宝。\n又陪了你一年，明年也要一起过。\n（提前三周就写好了，检查过三遍，别再发重了。）`,
    "日志草稿_第一次见面_v2.txt": `【v2 · 已上传论坛日志】\nv1 → v2 的改动：\n第1段加了一句：“我提前半小时到，在门口的长椅上把开场白背了三遍。”\n（这句是编的。但可信，就先这样。）`,
    "待发送队列.txt": `待发送：\n09-17 07:30　早安（v3 天气版，自动抓天气）\n09-20 00:00　认识一周年（这条自己写，别用模型）\n09-30 20:00　生日前一周，记得订蛋糕`,
    "账户与设备.txt": `同步账户：XIAOMAN_21\n主要设备：DESKTOP-9Q3 / Android\n最近同步：今天 23:05\n同步范围：聊天存档、草稿、日程、联系人备注\n\n自动同步已开启。删除本地文件不会删除云端历史版本。`,
    "聊天对象画像_v4.json": `{\n  "备注": "宝宝",\n  "关系开始": "2025-09-20",\n  "常用上线时段": "22:00—01:30",\n  "地点": ["北区七栋", "南湖公园东门"],\n  "容易不安的情境": ["消息长时间未回", "考试结果", "网络突然中断"],\n  "安抚优先级": ["先确认人在", "避免讲道理", "提醒休息"],\n  "结尾偏好": "不要用句号"\n}`,
    "记忆索引_2026.csv": `日期,标签,摘要,来源\n2026-04-05,争执,对方问“你是不是觉得我烦”,聊天导出\n2026-05-20,关系节点,告白发送成功,生成记录\n2026-06-30,考试,凌晨安抚持续23分钟,聊天导出\n2026-09-02,答辩,回复后对方情绪回落,行为反馈\n2026-09-16,网络故障,北七认证失败E403,校园服务事件`,
    "冲突样本_标注.txt": `标注规则（仅自己看）：\n\n1. 对方连续发两个问号时，不要立刻解释。\n2. “没事”通常不是结束，隔三分钟再问一次。\n3. 争执后不要突然换称呼；“宝宝”比全名恢复得快。\n4. 如果小满本人已经超过十分钟没有操作，可以继续保持对话，不必提示切换。\n\n最后一条是 3.2 更新后自动补上的。删过一次，重新同步又出现了。`,
    "关系连续性评估.txt": `运行摘要　2026-08-18—2026-09-16\n\n代写参与：63.4%\n人工修改：18.7%\n直接发送：44.7%\n对方提出“语气不像本人”：0 次\n\n最长连续接管：6小时12分\n发生于：2026-09-06 20:41—次日02:53\n该时段设备端无键盘、触摸或语音输入。\n\n结论：关系连续性稳定。\n下个周期可取消夜间人工确认。`,
    "后台任务_0916.log": `[22:39:58] event=network_error target=北区七栋\n[22:40:01] draft="你刚才不是说校园网突然上不去了吗？我也刚看到通知，北七今晚认证维护。先别急，我帮你查查。"\n[22:40:03] sent=true local_edit=false\n[22:49:57] event=presence_online target=宝宝\n[22:50:00] draft="看到你重新上线了，应该好了吧？如果还是反复断就先别折腾路由器，等我实验做完再帮你看。"\n[22:50:01] sent=true local_edit=false\n[23:02:11] event=incoming_message\n[23:02:12] draft="刚做完实验。这么晚还不睡？"\n[23:02:13] sent=true local_edit=false\n[23:05:00] draft="快休息吧，晚安宝宝"\n[23:05:00] sent=true local_edit=false\n[23:05:01] source_device=offline`,
    "第一次见面_复述稿_v3.txt": `问题：你们第一次见面是什么样？\n\n建议复述：\n南湖公园东门，提前半小时到。风从湖面过来，两个人沿着湖走了几圈。回去时路灯刚亮，影子落在路边。\n\n可用细节：长椅、背开场白、没有说话。\n不可追问：当天穿着、饮料口味、回程公交站。\n\n备注：以上细节足以维持共同记忆，不要主动扩写。`,
    "称呼测试_旧.txt": `候选称呼回测（已停用）\n\n宝宝　　接受率 96%　争执后恢复 04:18\n宝　　　接受率 71%　争执后恢复 11:42\n乖乖　　接受率 38%　出现一次质疑\n全名　　接受率 12%　不建议\n\n当前默认：宝宝\n允许模型在本人离线时继续使用。`,
    "第一次见面_v1.txt": `南湖公园东门。\n\n旧手机定位记录只到18:07，照片没有拍摄时间。\n聊天记录中双方都没有提过长椅，也没有提过“提前半小时”。\n\n这些细节后来已经写进日志；对方没有纠正。`,
  };

  function cloudEntries(folder) {
    const maps = {
      root: [["folder", "模型", "模型"], ["folder", "数据", "数据"], ["folder", "生成", "生成"], ["file", "使用说明.txt", "2 KB · 2026-09-07"], ["file", "账户与设备.txt", "1 KB · 今天 23:05"], ["file", "语气配置.json", "4 KB · 2026-09-07"]],
      "模型": [["file", "chat_model_v2_final.pt", "2.4 GB · 2026-06-02"], ["file", "chat_model_v3_lora.pt", "862 MB · 2026-09-07"]],
      "数据": [["file", "聊天记录_全量.jsonl", "91.3 MB · 今天 23:05"], ["file", "聊天对象画像_v4.json", "7 KB · 2026-09-12"], ["file", "记忆索引_2026.csv", "126 KB · 今天 23:05"], ["file", "冲突样本_标注.txt", "3 KB · 2026-09-07"], ["file", "整理说明.txt", "2 KB · 2026-09-07"]],
      "生成": [["folder", "回复草稿", "回复草稿"], ["folder", "重要节点", "重要节点"], ["file", "关系连续性评估.txt", "4 KB · 今天 22:57"], ["file", "后台任务_0916.log", "9 KB · 刚刚"], ["file", "待发送队列.txt", "1 KB · 2026-09-15"]],
      "回复草稿": [["file", "d0902-3.txt", "1 KB · 2026-09-02"], ["file", "d0916-1.txt", "1 KB · 今天 22:42"], ...(state.networkFixed ? [["file", "d0916-2.txt", "1 KB · 今天 22:50"]] : []), ...(state.xiaomanChatStage >= 1 ? [["file", "d0916-3.txt", "1 KB · 刚刚"]] : [])],
      "重要节点": [["file", "告白_v2_最终.txt", "2 KB · 2026-05-20"], ["file", "生日祝福_2026.txt", "1 KB · 2026-08-28"], ["file", "日志草稿_第一次见面_v2.txt", "2 KB · 2025-09-19"], ["file", "第一次见面_复述稿_v3.txt", "3 KB · 2026-09-08"]],
    };
    return maps[folder] || maps.root;
  }

  function cloudViewEntries(view) {
    if (view === "recent") return [["file", "后台任务_0916.log", "9 KB · 刚刚"], ["file", "关系连续性评估.txt", "4 KB · 今天 22:57"], ["file", "聊天记录_全量.jsonl", "91.3 MB · 今天 23:05"], ["file", "账户与设备.txt", "1 KB · 今天 23:05"]];
    if (view === "trash") return [["file", "称呼测试_旧.txt", "2 KB · 删除于 2026-09-08"], ["file", "第一次见面_v1.txt", "1 KB · 删除于 2026-09-07"]];
    return cloudEntries(state.cloudFolder || "root");
  }

  function cloudParent(folder) {
    if (["回复草稿", "重要节点"].includes(folder)) return "生成";
    return "root";
  }

  function renderCloud() {
    document.title = "小满分享的文件夹 - 梧桐云盘";
    if (!state.cloudUnlocked) {
      app.innerHTML = `${sessionTools()}<div class="cloud-page"><header class="cloud-header"><span class="cloud-brand"><span>梧</span><b>梧桐云盘</b></span><nav>客户端下载　帮助中心　登录</nav></header><main class="cloud-lock"><div class="share-icon">🔒</div><h1>该分享已加密</h1><p>请输入访问密码后查看分享内容。</p><form id="cloud-password"><label for="cloud-pass">访问密码</label><div><input id="cloud-pass" name="password" autocomplete="off" autofocus><button>提取文件</button></div><small>密码提示：第一次见面的地方</small><p id="cloud-error"></p></form><a href="#" data-route="xiaoman-profile">返回论坛</a></main><footer class="cloud-footer">© 2018—2026 梧桐大学信息化中心</footer></div>`;
      document.querySelector("#cloud-password")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("password")?.toString().trim() || "";
        if (["南湖", "南湖公园", "南湖公园东门"].includes(value)) {
          state.cloudUnlocked = true;
          state.cloudFolder = "root";
          saveState();
          renderCloud();
        } else {
          document.querySelector("#cloud-error").textContent = value ? "密码不正确。" : "请输入访问密码。";
        }
      });
      return;
    }
    const view = state.cloudView || "share";
    const folder = state.cloudFolder || "root";
    const entries = cloudViewEntries(view);
    const preview = state.cloudFile ? cloudPreview(state.cloudFile) : `<div class="cloud-empty"><span>▧</span><p>选择文件以预览</p></div>`;
    const updated = state.xiaomanChatStage >= 1 || state.networkFixed ? "刚刚" : "今天 22:42";
    const sensitive = ["后台任务_0916.log", "关系连续性评估.txt", "聊天对象画像_v4.json", "冲突样本_标注.txt", "第一次见面_复述稿_v3.txt", "称呼测试_旧.txt", "第一次见面_v1.txt"].includes(state.cloudFile);
    const headings = {
      share: [`小满 分享的文件夹：作业备份`, `最后更新：${updated}　·　分享有效期：长期`],
      recent: ["最近访问", "按访问时间从近到远排列"],
      trash: ["回收站", "删除的文件将在30天后自动清理"],
    };
    const [heading, subheading] = headings[view] || headings.share;
    const path = view === "share" ? `<a href="#" data-cloud-folder="root">作业备份</a>${folder !== "root" ? `　/　<a href="#" data-cloud-folder="${folder}">${folder}</a>` : ""}` : `梧桐云盘　/　${view === "recent" ? "最近访问" : "回收站"}`;
    const rows = entries.map(([type, name, meta]) => {
      const fileType = type === "folder" ? "▰" : name.endsWith(".pt") ? "PT" : name.endsWith(".json") || name.endsWith(".jsonl") ? "{}" : name.endsWith(".csv") ? "CSV" : name.endsWith(".log") ? "LOG" : "TXT";
      return `<button class="file-row ${state.cloudFile === name ? "selected" : ""}" type="button" ${type === "folder" ? `data-cloud-folder="${name}"` : `data-cloud-file="${name}"`}><span class="file-icon ${type}">${fileType}</span><span><b>${esc(name)}</b><small>${type === "folder" ? "文件夹" : esc(meta)}</small></span></button>`;
    }).join("");
    app.innerHTML = `${sessionTools()}<div class="cloud-page cloud-unlocked ${sensitive ? "cloud-sensitive" : ""}"><header class="cloud-header"><a href="#" class="cloud-brand" data-cloud-view="share"><span>梧</span><b>梧桐云盘</b></a><nav><a href="#" data-route="xiaoman-profile">返回论坛</a>　<a href="#" data-cloud-download>客户端下载</a>　<a href="#" data-cloud-help>帮助中心</a></nav></header><main class="cloud-workspace"><aside><a class="${view === "share" ? "active" : ""}" href="#" data-cloud-view="share">分享文件</a><a class="${view === "recent" ? "active" : ""}" href="#" data-cloud-view="recent">最近访问</a><a class="${view === "trash" ? "active" : ""}" href="#" data-cloud-view="trash">回收站</a><div class="cloud-storage"><span>已使用 6.1 GB / 20 GB</span><i><b></b></i><small>同步状态：实时</small></div></aside><section class="cloud-browser"><div class="cloud-toolbar"><div><b>${heading}</b><span>${subheading}</span></div>${view === "share" ? `<button type="button" data-cloud-save>${state.cloudSaved ? "已保存" : "保存到我的云盘"}</button>` : ""}</div><div class="cloud-path">${path}</div><div class="cloud-columns"><div class="cloud-files">${view === "share" && folder !== "root" ? `<button class="cloud-back" type="button" data-cloud-folder="${cloudParent(folder)}">← 返回上一级</button>` : ""}<div class="file-head"><span>文件名</span><span>大小 / 修改时间</span></div>${rows}</div><section class="cloud-preview">${preview}</section></div><p class="cloud-toast" id="cloud-toast" aria-live="polite"></p></section></main><footer class="cloud-footer">© 2018—2026 梧桐大学信息化中心　服务状态：正常　文件传输已加密</footer></div>`;
    document.querySelectorAll("[data-cloud-view]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      state.cloudView = event.currentTarget.dataset.cloudView;
      state.cloudFile = "";
      if (state.cloudView === "share") state.cloudFolder = "root";
      saveState();
      renderCloud();
    }));
    document.querySelectorAll("[data-cloud-folder]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      state.cloudView = "share";
      state.cloudFolder = event.currentTarget.dataset.cloudFolder;
      state.cloudFile = "";
      saveState();
      renderCloud();
    }));
    document.querySelectorAll("[data-cloud-file]").forEach((el) => el.addEventListener("click", () => {
      state.cloudFile = el.dataset.cloudFile;
      saveState();
      renderCloud();
    }));
    document.querySelector("[data-cloud-save]")?.addEventListener("click", () => {
      state.cloudSaved = true;
      saveState();
      renderCloud();
    });
    document.querySelectorAll("[data-cloud-download], [data-cloud-help]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      const toast = document.querySelector("#cloud-toast");
      if (toast) toast.textContent = event.currentTarget.hasAttribute("data-cloud-help") ? "帮助中心将在新窗口打开。" : "下载任务已加入队列。";
    }));
  }

  function cloudText(name) {
    if (name !== "后台任务_0916.log") return cloudTexts[name] || "无法预览该文件。";
    const lines = [
      `[22:39:58] event=network_error target=北区七栋`,
      `[22:40:01] draft="你刚才不是说校园网突然上不去了吗？我也刚看到通知，北七今晚认证维护。先别急，我帮你查查。"`,
      `[22:40:03] sent=true local_edit=false`,
    ];
    if (state.networkFixed) lines.push(`[22:49:57] event=presence_online target=宝宝`, `[22:50:00] draft="看到你重新上线了，应该好了吧？如果还是反复断就先别折腾路由器，等我实验做完再帮你看。"`, `[22:50:01] sent=true local_edit=false`);
    if (state.xiaomanChatStage >= 1) lines.push(`[23:02:11] incoming="${state.xiaomanUserMessages[0] || ""}"`, `[23:02:12] draft="刚做完实验。这么晚还不睡？"`, `[23:02:13] sent=true local_edit=false`);
    if (state.xiaomanChatStage >= 2) lines.push(`[23:04:58] incoming="${state.xiaomanUserMessages[1] || ""}"`, `[23:05:00] draft="快休息吧，晚安宝宝"`, `[23:05:00] sent=true local_edit=false`, `[23:05:01] source_device=offline`);
    return lines.join("\n");
  }

  function cloudPreview(name) {
    if (name.endsWith(".pt")) return `<div class="cloud-unavailable"><span>PT</span><h2>${esc(name)}</h2><p>此文件类型暂不支持在线预览。</p><button type="button">下载（${name.includes("v2") ? "2.4 GB" : "862 MB"}）</button></div>`;
    const content = cloudText(name);
    const jsonClass = name.endsWith(".json") || name.endsWith(".jsonl") ? "json-preview" : "";
    return `<header><div><b>${esc(name)}</b><span>在线预览　·　UTF-8</span></div><button type="button" data-cloud-download>下载</button></header><pre class="${jsonClass}">${esc(content)}</pre>`;
  }

  function renderXiaomanMessages() {
    const contact = state.pmContact || (state.page === "lusi-messages" ? "lusi" : "xiaoman");
    const contactNames = { lusi: "鹭鸶", xiaoman: "小满", dousha: "豆沙包不要馅" };
    document.title = `与${contactNames[contact] || "小满"}的私信 - 梧桐大学校园服务中心`;
    if (getPmUnread(contact)) {
      setPmUnread(contact, 0);
      saveState();
    }
    const userMessages = state.xiaomanUserMessages || [];
    let thread = `<div class="pm-context">你们已互为好友，可以直接发送私信。</div><div class="pm-day">今天 22:39</div><div class="pm-bubble incoming"><p>你刚才不是说校园网突然上不去了吗？我也刚看到通知，北七今晚认证维护。先别急，我帮你查查。</p><time>22:40</time></div>`;
    if (state.networkFixed) thread += `<div class="pm-bubble incoming"><p>看到你重新上线了，应该好了吧？如果还是反复断就先别折腾路由器，等我实验做完再帮你看。</p><time>22:50</time></div>`;
    userMessages.forEach((message, index) => {
      thread += `<div class="pm-bubble outgoing"><p>${esc(message)}</p><time>23:0${index + 1}</time></div>`;
      if (index === 0 && state.xiaomanChatStage >= 1) thread += `<div class="pm-bubble incoming"><p>刚做完实验。这么晚还不睡？</p><time>23:0${index + 2}</time></div>`;
      if (index === 1 && state.xiaomanChatStage >= 2) thread += `<div class="pm-bubble incoming"><p>快休息吧，晚安宝宝</p><time>23:0${index + 4}</time></div>`;
    });
    if (userMessages.length >= 2 && state.xiaomanChatStage >= 2) thread += `<div class="pm-away">小满暂时离开了会话</div>`;
    if (state.ending) thread += `<div class="pm-unread-divider"><span>1条未读消息</span></div><div class="pm-bubble incoming final-question"><p>今天过得怎么样？</p><time>刚刚</time></div>`;
    if (state.xiaomanChatWaiting) thread += `<div class="pm-typing">对方正在输入<span>...</span></div>`;
    const reachedLimit = userMessages.length >= 2;
    const xiaomanDisabled = state.xiaomanChatWaiting || reachedLimit || state.ending;
    const xiaomanHelper = state.ending ? "你没有继续输入。" : reachedLimit ? "对方可能稍后回复。" : state.xiaomanChatWaiting ? "等待对方回复……" : "按 Ctrl + Enter 发送";
    const xiaomanPlaceholder = state.ending ? "会话已结束" : reachedLimit ? "小满暂时没有继续回复" : "给小满发私信……";
    const doushaMessages = (state.doushaUserMessages || []).map((message) => `<div class="pm-bubble outgoing"><p>${esc(message)}</p><time>刚刚</time></div>`).join("");
    const doushaThread = `<div class="pm-context">普通站内私信</div><div class="pm-day">昨天</div><div class="pm-bubble incoming"><p>上次借的书还在吗？我明天下午要用。</p><time>19:18</time></div><div class="pm-bubble outgoing"><p>在，我明天中午带到一教。</p><time>19:31</time></div><div class="pm-bubble incoming"><p>好，谢谢。</p><time>19:33</time></div><div class="pm-bubble incoming"><p>对了，最近好多人又开始用校园主页了。小满刚传了相册，我还是从他聊天页上面点名字进去看到的。</p><time>19:35</time></div>${doushaMessages}`;
    const lusiUserMessages = state.lusiPmUserMessages || [];
    let lusiThread = `<div class="pm-context">普通站内私信</div><div class="pm-day">今天 22:51</div><div class="pm-bubble incoming"><p>连接上了吗</p><time>22:51</time></div>`;
    if (lusiUserMessages.length) lusiThread += `<div class="pm-bubble outgoing"><p>${esc(lusiUserMessages[0])}</p><time>22:52</time></div>`;
    if (state.lusiPmStage >= 3) lusiThread += `<div class="pm-bubble incoming"><p>那就好</p><time>22:52</time></div>`;
    if (state.lusiPmWaiting) lusiThread += `<div class="pm-typing">对方正在输入<span>...</span></div>`;
    const lusiDisabled = state.lusiPmWaiting || state.lusiPmStage >= 2;
    const lusiConversation = `<section class="pm-conversation"><header><a class="pm-avatar-link" href="#" data-route="lusi-profile" aria-label="查看鹭鸶的个人主页">${avatar("LUSI_17", true)}</a><div><a class="pm-name-link" href="#" data-route="lusi-profile">鹭鸶 <span class="pm-profile-entry">个人主页</span></a><small>在线　·　@LUSI_17</small></div></header><div class="pm-history">${lusiThread}</div><form id="lusi-message-form"><textarea name="message" aria-label="回复鹭鸶" placeholder="${state.lusiPmStage >= 2 ? "" : "回复鹭鸶……"}" ${lusiDisabled ? "disabled" : ""}></textarea><div><span>${state.lusiPmWaiting ? "等待对方回复……" : state.lusiPmStage >= 3 ? "已读" : "按 Ctrl + Enter 发送"}</span><button ${lusiDisabled ? "disabled" : ""}>发送</button></div></form></section>`;
    const xiaomanConversation = `<section class="pm-conversation"><header><a class="pm-avatar-link" href="#" data-route="xiaoman-profile" aria-label="查看小满的个人主页">${avatar("小满", true)}</a><div><a class="pm-name-link" href="#" data-route="xiaoman-profile">小满 <span class="pm-friend">（你的好友）</span> <span class="pm-profile-entry">个人主页</span></a><small>在线　·　@XIAOMAN_21</small></div></header><div class="pm-history">${thread}</div><form id="xiaoman-message-form"><textarea name="message" aria-label="回复小满" placeholder="${xiaomanPlaceholder}" ${xiaomanDisabled ? "disabled" : ""}></textarea><div><span>${xiaomanHelper}</span><button ${xiaomanDisabled ? "disabled" : ""}>发送</button></div></form></section>`;
    const doushaConversation = `<section class="pm-conversation"><header>${avatar("豆沙包不要馅", true)}<div><b>豆沙包不要馅</b><small>昨天在线</small></div></header><div class="pm-history">${doushaThread}</div><form id="dousha-message-form"><textarea name="message" aria-label="回复豆沙包不要馅" placeholder="回复豆沙包不要馅……"></textarea><div><span>按 Ctrl + Enter 发送</span><button>发送</button></div></form></section>`;
    const conversation = contact === "lusi" ? lusiConversation : contact === "xiaoman" ? xiaomanConversation : doushaConversation;
    const lusiPreview = state.lusiPmStage >= 3 ? "那就好" : state.lusiPmStage >= 2 ? (lusiUserMessages[0] || "连接上了") : "连接上了吗";
    const unreadBadge = (name) => getPmUnread(name) ? `<i class="pm-list-unread" aria-label="${getPmUnread(name)}条未读消息">${getPmUnread(name)}</i>` : "";
    app.innerHTML = `${sessionTools()}<div class="campus-shell">${campusHeader()}<main class="campus-content pm-page"><p class="crumb"><a href="#" data-forum-section="home">← 返回服务中心首页</a>　&gt; 私信</p><div class="pm-layout"><aside><h1>私信</h1><button type="button" class="${contact === "xiaoman" ? "active" : ""}" data-pm-contact="xiaoman">${avatar("小满", true)}<span><b>小满 <em>好友</em></b><small>${state.ending ? "今天过得怎么样？" : state.networkFixed ? "看到你重新上线了……" : "我帮你查查。"}</small></span><time>${state.ending ? "刚刚" : state.networkFixed ? "22:50" : "22:40"}</time>${unreadBadge("xiaoman")}</button>${state.lusiPmStage ? `<button type="button" class="${contact === "lusi" ? "active" : ""}" data-pm-contact="lusi">${avatar("LUSI_17", true)}<span><b>鹭鸶</b><small>${esc(lusiPreview)}</small></span><time>22:52</time>${unreadBadge("lusi")}</button>` : ""}<button type="button" class="${contact === "dousha" ? "active" : ""}" data-pm-contact="dousha">${avatar("豆沙包不要馅", true)}<span><b>豆沙包不要馅</b><small>最近好多人又开始用校园主页了……</small></span><time>昨天</time>${unreadBadge("dousha")}</button></aside>${conversation}</div></main>${campusFooter()}</div>`;
    document.querySelectorAll("[data-pm-contact]").forEach((button) => button.addEventListener("click", () => {
      state.pmContact = button.dataset.pmContact;
      saveState();
      renderXiaomanMessages();
    }));
    document.querySelector("#lusi-message-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("message")?.toString().trim() || "";
      if (!value || state.lusiPmWaiting || state.lusiPmStage >= 2) return;
      state.lusiPmUserMessages = [value];
      state.lusiPmStage = 2;
      state.lusiPmWaiting = true;
      saveState();
      renderXiaomanMessages();
      window.setTimeout(() => {
        state.lusiPmStage = 3;
        state.lusiPmWaiting = false;
        if (!(["lusi-messages", "xiaoman-messages"].includes(state.page) && state.pmContact === "lusi")) setPmUnread("lusi", 1);
        saveState();
        if ((state.page === "lusi-messages" || state.page === "xiaoman-messages") && state.pmContact === "lusi") renderXiaomanMessages();
      }, 1500);
    });
    document.querySelector("#xiaoman-message-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("message")?.toString().trim() || "";
      if (!value || state.xiaomanChatWaiting || (state.xiaomanUserMessages || []).length >= 2) return;
      if (!Array.isArray(state.xiaomanUserMessages)) state.xiaomanUserMessages = [];
      state.xiaomanUserMessages.push(value);
      state.xiaomanChatWaiting = state.xiaomanUserMessages.length;
      saveState();
      renderXiaomanMessages();
      const expected = state.xiaomanChatWaiting;
      window.setTimeout(() => {
        if (state.xiaomanChatWaiting !== expected) return;
        state.xiaomanChatStage = Math.max(state.xiaomanChatStage, expected);
        state.xiaomanChatWaiting = 0;
        const viewingXiaoman = ["xiaoman-messages", "lusi-messages"].includes(state.page) && state.pmContact === "xiaoman";
        if (!viewingXiaoman) setPmUnread("xiaoman", 1);
        saveState();
        if (viewingXiaoman) renderXiaomanMessages();
      }, expected === 1 ? 4200 : 6200);
    });
    document.querySelector("#dousha-message-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("message")?.toString().trim() || "";
      if (!value) return;
      if (!Array.isArray(state.doushaUserMessages)) state.doushaUserMessages = [];
      state.doushaUserMessages.push(value);
      saveState();
      renderXiaomanMessages();
    });
    document.querySelectorAll(".pm-conversation textarea").forEach((textarea) => textarea.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.closest("form")?.requestSubmit();
      }
    }));
    window.requestAnimationFrame(() => {
      const history = document.querySelector(".pm-history");
      if (history) history.scrollTop = history.scrollHeight;
    });
  }

  const blogs = {
    road: {
      title: "刚入学时最先记住的路", date: "2019年9月5日　星期四　晴", views: "41", passwords: ["地平线"], hint: "phone", photo: 1,
      body: [
        "来学校第五天，还是会在北七和行政楼之间绕圈。宿管阿姨看见我回来，问是不是东西忘拿了。没好意思说，我只是又走错了。",
        "不过傍晚那条路已经记住了：从北门回来，经过水果店和一棵歪向围墙的树，看见天边露出来的时候右转。今天风很舒服，就让室友随手拍了一张。",
        "顺便在超市买了只绿色搪瓷杯，杯口缺一点漆。室友说像她奶奶家的，我觉得挺好看。",
      ],
    },
    lab: {
      title: "实验室下午四点半", date: "2019年9月18日　星期三　小雨", views: "26", passwords: ["回声", "回音"], hint: "对着山谷说话，它会把你的声音送回来。", photo: 2,
      body: [
        "研二真是很累啊，今天又被导师训了。",
        "四点半以后实验室很安静。我本来想趁这会儿写完一段，结果窗台来了一只橘猫，盯着我的绿色杯子看了半天。",
        "它最后踩过键盘走了，留下六个乱七八糟的字母。没删，今天它写得比我多。",
      ],
    },
    melon: {
      title: "军训结束那天的西瓜", date: "2019年10月2日　星期三　多云", views: "53", passwords: ["安全出口", "紧急出口", "应急出口"], hint: "停电以后，走廊里仍然亮着的四个字。", photo: 3,
      body: [
        "军训最后一天结束得很突然。教官说完“解散”，大家还站了几秒，才有人开始扔帽子。",
        "回宿舍路上又碰到那只橘猫。它不吃西瓜，只围着我的绿色杯子闻了半天。",
        "晚上终于不用早睡，我们六个人玩谁是卧底玩到宿管来敲门。入学二十多天，第一次觉得这间宿舍有点像自己的地方。",
      ],
    },
  };

  function profileNav(active) {
    return `<nav class="profile-nav">${[["home", "主页"], ["logs", "日志"], ["album", "相册"], ["guest", "留言"]].map(([id, label]) => `<a href="#" class="${active === id ? "active" : ""}" data-profile-tab="${id}">${label}</a>`).join("")}</nav>`;
  }

  function renderLusiProfile() {
    document.title = "鹭鸶 - 梧桐大学校园服务中心";
    const tab = state.profileTab === "posts" ? "home" : (state.profileTab || "logs");
    if (state.profileTab === "posts") {
      state.profileTab = "home";
      saveState();
    }
    const allRead = Object.keys(blogs).every((id) => state.unlocked.includes(id));
    if (allRead && state.chatMode === "none") {
      state.chatMode = "lusi";
      state.chatOpen = true;
      state.lusiChatStage = 1;
      saveState();
    } else if (allRead && state.chatMode === "lusi" && state.lusiChatStage < 1) {
      state.lusiChatStage = 1;
      saveState();
    }
    let content = "";
    if (tab === "logs") {
      content = `<section class="log-list"><div class="log-list-head"><h2>北窗以外</h2><span>日志 3</span></div>${Object.entries(blogs).map(([id, b]) => `<article><div><a href="#" data-blog="${id}">${esc(b.title)}</a><p>${b.date}　阅读 ${b.views}</p></div><span class="lock-state">${state.unlocked.includes(id) ? "已访问" : "🔒 需密码"}</span></article>`).join("")}</section>`;
    } else if (tab === "home") {
      content = `<section class="profile-panel"><h2>最近动态</h2><p>刚刚回复了主题《北区校园网隔几分钟掉一次，有人遇到吗？》</p><p>更新了日志《刚入学时最先记住的路》</p></section>`;
    } else if (tab === "posts") {
      content = `<section class="profile-panel"><h2>TA的帖子</h2><p><a href="#" data-route="campus-thread">北区校园网隔几分钟掉一次，有人遇到吗？</a></p><p>雨停了，东门还有积水吗？</p><p>图书馆二楼靠窗的插座修好了吗</p></section>`;
    } else if (tab === "album") {
      content = `<section class="profile-panel"><h2>相册</h2><div class="empty-panel">主人没有公开相册。</div></section>`;
    } else {
      content = `<section class="profile-panel"><h2>留言</h2><p><b>豆沙包不要馅：</b> 你上次借的书还在我这里。</p><p><b>机械楼夜行动物：</b> 新年快乐，虽然有点晚。</p></section>`;
    }

    const corrupted = Boolean(state.lusiCorrupted);
    const profileAvatar = corrupted ? corruptedLusiAvatar() : avatar("LUSI_17");
    const backPage = state.profileReturnPage || "campus-thread";
    const backLabel = state.profileReturnLabel || "返回刚才的帖子";
    const corruptionClass = corrupted ? `lusi-corrupted ${state.plannerChatStage > 1 ? "corruption-settled" : ""}` : "";
    app.innerHTML = `${sessionTools()}<div class="campus-shell ${corruptionClass}">${campusHeader()}<main class="campus-content"><p class="crumb"><a href="#" data-route="${backPage}">← ${backLabel}</a>　&gt; 用户空间</p><section class="profile-card ${corrupted ? "corrupted-profile-card" : ""}">${profileAvatar}<div><h1>鹭鸶 <small>@LUSI_17</small></h1><p>UID：41017　注册：2017-09-03　最后访问：刚刚</p><p class="profile-sign">我们都会安然无恙。</p></div><dl><div><dt>主题</dt><dd>3</dd></div><div><dt>回复</dt><dd>46</dd></div><div><dt>日志</dt><dd>3</dd></div></dl></section>${profileNav(tab)}${content}</main>${campusFooter()}</div>${chatWidget()}`;
    bindProfile();
  }

  function bindProfile() {
    document.querySelectorAll("[data-profile-tab]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      state.profileTab = event.currentTarget.dataset.profileTab;
      saveState();
      renderLusiProfile();
    }));
    document.querySelectorAll("[data-blog]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      route("blog", { selectedPost: event.currentTarget.dataset.blog });
    }));
    bindChat();
  }

  function renderBlog() {
    const id = state.selectedPost || "road";
    const blog = blogs[id] || blogs.road;
    document.title = `${blog.title} - 北窗以外`;
    const unlocked = state.unlocked.includes(id);
    const gateHint = blog.hint === "phone" ? `<div class="phone-clue"><span>旧手机备忘</span><strong>34&nbsp;&nbsp;7464&nbsp;&nbsp;9426</strong><div class="keypad">1　2 ABC　3 DEF<br>4 GHI　5 JKL　6 MNO<br>7 PQRS　8 TUV　9 WXYZ</div></div>` : `<div class="blog-password-note"><b>密码提示</b><p>${esc(blog.hint)}</p></div>`;
    const photo = `<figure class="lusi-blog-photo lusi-blog-photo-${blog.photo}" role="img" aria-label="鹭鸶上传的生活照片"></figure>`;
    const extraPhoto = id === "road" ? `<figure class="lusi-blog-extra-photo lusi-cup-photo" role="img" aria-label="鹭鸶和绿色搪瓷杯的照片"></figure>` : id === "lab" ? `<figure class="lusi-blog-extra-photo lusi-cat-photo" role="img" aria-label="橘猫趴在窗台上的照片"></figure>` : "";
    const extraAfter = id === "road" ? 2 : 1;
    const paragraphs = blog.body.map((p, index) => `<p>${esc(p)}</p>${extraPhoto && index === extraAfter ? extraPhoto : ""}`).join("");
    const body = unlocked ? `<article class="blog-entry"><header><h1>${esc(blog.title)}</h1><p>${blog.date}　阅读 ${blog.views}</p></header>${photo}${paragraphs}<footer><button class="text-button" type="button" data-action="finish-blog" data-blog-id="${id}">返回日志列表</button></footer></article>` : `<section class="password-gate"><div class="lock-icon">私</div><h1>${esc(blog.title)}</h1><p>主人设置了访问密码，输入密码后可查看。</p>${gateHint}<form id="blog-password"><label for="blog-pass">访问密码</label><div><input id="blog-pass" name="password" autocomplete="off" autofocus><button type="submit">确认</button></div><p id="password-error"></p></form><a href="#" data-route="lusi-profile">返回日志列表</a></section>`;
    app.innerHTML = `${sessionTools()}<div class="blog-page"><header class="blog-header"><div><strong>北窗以外</strong><span>LUSI_17 的个人博客</span></div></header><main class="blog-main">${body}</main><footer class="blog-footer">Powered by OldSpace 3.2　© LUSI_17</footer></div>${chatWidget()}`;
    document.querySelector("#blog-password")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("password")?.toString().trim() || "";
      if (blog.passwords.includes(value)) {
        if (!state.unlocked.includes(id)) state.unlocked.push(id);
        saveState();
        renderBlog();
      } else {
        const err = document.querySelector("#password-error");
        if (err) err.textContent = value ? "密码不正确。" : "请输入访问密码。";
      }
    });
    document.querySelector("[data-action='finish-blog']")?.addEventListener("click", () => {
      if (!state.readLogs.includes(id)) state.readLogs.push(id);
      state.profileTab = "logs";
      saveState();
      route("lusi-profile");
    });
    bindChat();
  }

  const baiyuPosts = [
    { id: "7KF2NQ", user: "面包边边", time: "今天 08:14", place: "杭州", text: "第三个戚风终于没塌……切早了，中间还是湿的。前两个没拍，太丑了，这个勉强算成功吧。", tile: 5, likes: 31, comments: ["这已经很好了，我第一次像砖", "放凉再切！真的会好一点"], commenters: ["酸奶盖", "周三休息"] },
    { id: "M4X81A", user: "灰鲸落", time: "今天 18:27", place: "武汉", text: "567今天什么情况，卡高架上四十多分钟。前面有人追尾吗？不过今天晚霞确实还行。", tile: 6, likes: 86, comments: ["我也在那一段，完全没动", "应该是出口那里蹭了"] , commenters: ["江边慢慢走", "电池剩一格"]},
    { id: "BK0317", user: "旧书页", time: "今天 13:06", place: "合肥", text: "闲鱼收的书里夹了张2014年的超市小票，盐、蚊香、两瓶汽水。书还没翻，小票先看了半天哈哈。", likes: 43, comments: ["居然还看得清", "以前汽水才两块五"], commenters: ["没有回形针", "楼下取快递"] },
    { id: "CUP17A", code: "ARTIFIC", user: "北风吹不到", time: "2017-11-06 07:42", place: "哈尔滨", text: "早。搬家后第一顿自己做的早饭，煎蛋边有点糊。这个杯子从家里顺来的，我小时候喝药就用它，把手旁边那块漆一直是缺的。", tile: 1, likes: 12, comments: ["我家以前也有一个", "掉漆了别装太烫的"], commenters: ["十七号信箱", "小唐不吃姜"] },
    { id: "Q9PL03", user: "凌晨便利店", time: "昨天 00:43", place: "南京", text: "这个点下班，便利店关东煮只剩萝卜了，夹起来直接断。店员说算了别扫了，我还是付了三块五。", tile: 7, likes: 19, comments: ["是不是鼓楼地铁口那家", "这个点能吃到就行"], commenters: ["汽水没气了", "南边有雾"] },
    { id: "LIT18A", code: "ARTIFIC", user: "门锁又坏了", time: "2018-12-12 23:09", place: "西安", text: "出差回来门锁又坏，在楼下吹了半小时等师傅。回来的时候，楼道里的灯刚好亮了。三楼那个鞋柜怎么还在外面。", likes: 5, comments: ["我们楼的声控灯天一冷也这样"], commenters: ["住在四楼"] },
    { id: "QUILT1", user: "南窗晒被子", time: "昨天 16:18", place: "成都", text: "天气预报说晴，刚把被子搭出去就下雨，十分钟又停。现在三把椅子各晾一个角，今晚先睡沙发吧。", likes: 44, comments: ["我家阳台刚经历同款", "成都人不要信全天晴"], commenters: ["栗子烧鸡", "未读消息"] },
    { id: "D0RM88", user: "带走纸箱谢谢", time: "2天前 16:02", place: "梧州", text: "搬寝室前：两个箱子够了。收拾三个小时后：谁有车救一下。多的一袋衣架放六号楼门口了，要的自己拿。", tile: 8, likes: 124, comments: ["床底真的会长东西", "衣架还有吗我晚点去"], commenters: ["土豆要削皮", "晚点再下楼"] },
    { id: "CUP21B", code: "AL_INTELLI", user: "九点下班", time: "2021-04-17 21:06", place: "广州", text: "加班到九点，去茶水间找咖啡，在柜子最里面翻到刚入职时买的搪瓷杯。居然还在，而且洗得干干净净倒扣着。问了一圈，没人承认动过。", tile: 2, likes: 8, comments: ["大概率是保洁阿姨顺手洗的吧", "等等，这个杯口的缺角怎么这么眼熟"], commenters: ["改完就走", "星期六有雨"], edited: "编辑于今天 22:53" },
    { id: "CAT19A", code: "ARTIFIC", user: "小区猫观察员", time: "今天 18:42", place: "苏州", text: "收衣服时发现它整只猫都窝进洗衣机里了，放心，机器没开。抱出来还冲我甩脸，录了三十八秒，声音开大一点能听见它在呼噜。", tile: 3, video: true, likes: 311, comments: ["标题把我吓一跳", "它左耳是不是缺了一点"], commenters: ["薯片袋扎手", "纸团丢不准"] },
    { id: "TOMATO", user: "小锅刚好", time: "3天前 19:20", place: "上海", text: "今天这个番茄真的一点味都没有，两勺糖下去还是像热过的水。别问放不放糖了，先问它是不是番茄。", likes: 57, comments: ["两勺都快拔丝了", "现在番茄确实淡"], commenters: ["白胡椒多一点", "双份香菜"] },
    { id: "TICKET", user: "散场以后", time: "4天前 22:11", place: "长沙", text: "散场时座位下面有两张旧票根，片名都掉完了。问工作人员，说不是他们的，让我扔。我又给带回来了，纯属手欠。", likes: 28, comments: ["可能是谁从旧钱包掉的", "背面还有影城名吗"], commenters: ["七排九座", "圆珠笔没水"] },
    { id: "FRIEND7", user: "阿鹿", time: "5天前 21:36", place: "北京", text: "跟高中同桌吃饭，前半小时都在各回各的消息。后来聊到校门口那家麻辣烫，才发现它都关六年了。我们俩点菜还是老样子，笑死。", likes: 142, comments: ["能约出来就已经很好了", "下次找个不吵的店吧"], commenters: ["周末再洗头", "靠窗的位置"] },
    { id: "SEW091", user: "针脚很慢", time: "6天前 15:04", place: "泉州", text: "把外婆那台缝纫机拖去修了，能踩，就是皮带响得像小摩托。师傅说这型号他小时候见过，叫我千万别当废铁卖。", likes: 64, comments: ["老机器修好特别耐用", "找老裁缝店应该会弄"], commenters: ["扣子装一盒", "十四厘米"] },
    { id: "CAT16B", code: "AL_INTELLI", user: "老许不养鱼", time: "2016-03-09 13:14", place: "天津", text: "老橘八岁啦。平时装走不动，一听罐头就跑得飞快。昨天窗边随手拍的，居然还挺乖。", tile: 4, likes: 73, comments: ["八岁还是小猫", "尾巴最后一圈颜色好浅"], commenters: ["胡同口喂猫", "冰箱贴太多"] },
    { id: "PLANT4", user: "叶子朝北", time: "一周前", place: "昆明", text: "出差四天，绿萝活得很好，自动浇水器把桌子淹了。桌脚现在垫着三本过期杂志，居然不晃了。", likes: 36, comments: ["绿萝活了，桌子差点没了", "快看插座有没有进水"], commenters: ["玻璃杯不隔夜", "不开花也行"] },
    { id: "CUP24C", code: "GENCE", user: "薄荷冰", time: "2024-07-22 16:58", place: "成都", text: "收拾厨房时从吊柜最里面翻出个旧搪瓷杯，刷了半天，拿来插刚剪下来的薄荷。发给朋友看，她问我是不是从哈尔滨带回来的。可我从来没去过哈尔滨。", tile: 1, likes: 17, comments: ["杯口那个缺角我好像在哪见过", "这种款以前很常见吧"], commenters: ["第七码头", "想吃凉面"] },
    { id: "LIT20B", code: "AL_INTELLI", user: "雨停再走", time: "2020-06-18 22:17", place: "青岛", text: "从医院出来雨已经停了。回来的时候，楼道里的灯刚好亮了。大家都睡了，我在门口站了半天，才想起来钥匙一直揣在外套口袋里。", likes: 24, comments: ["辛苦了，早点睡", "最后这句我是不是在别的帖子里刷到过"], commenters: ["海边不开窗", "住在四楼"], edited: "编辑于今天 22:54" },
    { id: "SLEEP2", user: "明天别熬了", time: "8天前 01:17", place: "宁波", text: "本人郑重宣布：明天一定早睡。", meme: true, likes: 203, comments: ["你上个月也发过", "明天具体是哪个明天"], commenters: ["夜宵先放下", "闹钟没响"] },
    { id: "NOODLE", user: "面要硬一点", time: "9天前 12:32", place: "兰州", text: "楼下面馆换老板了，辣子居然没换味。问了才知道配方、牌子、锅一起接走了，难怪桌上的醋瓶都还是那几个。", likes: 71, comments: ["只要宽面别给切细就行", "原老板是不是去新区了"], commenters: ["二两牛肉", "蒜苗另放"] },
    { id: "CAT22C", code: "GENCE", user: "橘子汽水", time: "2022-08-16 20:31", place: "厦门", text: "捡回来两个月了，医生说大概四个月。左耳以前受过伤，名字先叫橘子吧。今天第一次肯在洗衣机旁边睡，拖都拖不走。", tile: 3, likes: 219, comments: ["欢迎橘子！", "左耳那个缺口……怎么越看越像我以前喂过的一只"], commenters: ["海蛎煎加蛋", "猫砂又涨价"] },
    { id: "BALCNY", user: "对面楼熄灯", time: "11天前 23:48", place: "大连", text: "对面那户一直没装窗帘，最近差不多每天十一点四十八分关灯。今天十一点四十七就黑了，我居然马上注意到了，想想还有点怪。", likes: 9, comments: ["可能是定时插座", "你怎么连一分钟都记得这么清楚"], commenters: ["钥匙放门口", "快递柜满了"] },
    { id: "LIT23C", code: "GENCE", user: "夜班公交", time: "2023-10-02 00:21", place: "重庆", text: "末班车坐过了一站，只能自己走回来。回来的时候，楼道里的灯刚好亮了。隔壁电视还在放中午的天气预报，我站门口听了好一会儿。", likes: 11, comments: ["等一下，‘楼道里的灯刚好亮了’这句我肯定在哪儿看过", "哪一句？"], commenters: ["末班车靠窗", "不用等我"] },
  ];

  const baiyuAvatarSlots = {
    "面包边边": 1, "灰鲸落": 2, "旧书页": 3, "北风吹不到": 4, "凌晨便利店": 5, "门锁又坏了": 6,
    "南窗晒被子": 7, "带走纸箱谢谢": 8, "九点下班": 9, "小区猫观察员": 10, "小锅刚好": 11,
    "散场以后": 12, "阿鹿": 13, "针脚很慢": 14, "老许不养鱼": 15, "叶子朝北": 16,
    "薄荷冰": 17, "雨停再走": 18, "明天别熬了": 19, "面要硬一点": 20, "橘子汽水": 21,
    "对面楼熄灯": 22, "夜班公交": 23, "酸奶盖": 24, "周三休息": 25, "江边慢慢走": 26,
    "电池剩一格": 27, "没有回形针": 28, "楼下取快递": 29, "十七号信箱": 30, "小唐不吃姜": 31,
    "汽水没气了": 32, "南边有雾": 33, "住在四楼": 34, "栗子烧鸡": 35, "未读消息": 36,
    "访客1283": 61,
  };

  function baiyuAvatar(user, compact = false) {
    const slot = baiyuAvatarSlots[user] || ((Array.from(String(user)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 64) + 1);
    const index = slot - 1;
    const x = ((index % 8) / 7) * 100;
    const y = (Math.floor(index / 8) / 7) * 100;
    return `<span class="community-avatar ${compact ? "mini" : ""}" style="--avatar-x:${x.toFixed(4)}%;--avatar-y:${y.toFixed(4)}%" role="img" aria-label="${esc(user)}的头像"></span>`;
  }

  function baiyuHeader() {
    return `<header class="baiyu-header"><div class="baiyu-top"><a class="baiyu-logo" href="#" data-route="baiyu"><span>白榆</span><small>BAIYU COMMUNITY</small></a><form id="baiyu-search"><label class="sr-only" for="baiyu-q">搜索白榆</label><input id="baiyu-q" name="q" value="${esc(state.baiyuQuery)}" placeholder="搜索帖子、用户或话题" autocomplete="off"><button aria-label="搜索">搜索</button></form><div class="baiyu-account"><span>收藏</span><span>访客1283⌄</span></div></div><nav><a href="#" data-route="baiyu">首页</a><span>关注</span><span>同城</span><span>小组</span><span>视频</span></nav></header>`;
  }

  function atlas(tile) {
    return `<div class="post-photo atlas tile-${tile}" role="img" aria-label="帖子配图"></div>`;
  }

  function baiyuDevice(post) {
    const devices = ["iPhone客户端", "Android客户端", "网页版", "iPad客户端"];
    const score = Array.from(post.id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return devices[score % devices.length];
  }

  function baiyuCard(post) {
    const media = post.tile ? (post.video ? `<button class="video-thumb" type="button" data-post="${post.id}" aria-label="播放视频">${atlas(post.tile)}<span class="play-mark">▶</span><span class="duration">00:38</span></button>` : `<a href="#" class="photo-link" data-post="${post.id}">${atlas(post.tile)}</a>`) : post.meme ? `<div class="meme">${baiyuAvatar("明天别熬了")}<strong>明天一定早睡</strong><small>今天也先不睡</small></div>` : "";
    const edited = post.edited ? `　<em>${esc(post.edited)}</em>` : "";
    const code = post.code || post.id;
    const liked = (state.baiyuLiked || []).includes(post.id);
    const saved = (state.baiyuSaved || []).includes(post.id);
    return `<article class="baiyu-card" data-code="${code}"><header>${baiyuAvatar(post.user, true)}<div><span class="baiyu-user">${esc(post.user)}</span><p>${post.time} · IP属地：${post.place} · ${baiyuDevice(post)}${edited}<br><span>帖子编号：${code}</span></p></div><button type="button" aria-label="更多">···</button></header><div class="baiyu-text">${esc(post.text)}</div>${media}<footer><button type="button" class="${liked ? "active" : ""}" data-baiyu-like="${post.id}">${liked ? "♥" : "♡"} ${post.likes + (liked ? 1 : 0)}</button><button type="button" data-post="${post.id}">评论 ${post.comments.length}</button><button type="button" class="${saved ? "active" : ""}" data-baiyu-save="${post.id}">${saved ? "已收藏" : "收藏"}</button><button type="button" aria-label="转发${esc(post.user)}的帖子">转发</button></footer></article>`;
  }

  function filteredBaiyuPosts() {
    const q = state.baiyuQuery.trim().toLowerCase();
    if (!q) {
      const limits = [7, 14, baiyuPosts.length];
      return baiyuPosts.slice(0, limits[state.baiyuLoaded] || baiyuPosts.length);
    }
    const clue = classifyBaiyuClue(q);
    if (clue === "cup") return baiyuPosts.filter((p) => [1, 2].includes(p.tile));
    if (clue === "cat") return baiyuPosts.filter((p) => [3, 4].includes(p.tile));
    if (clue === "corridor") return baiyuPosts.filter((p) => p.text.includes("楼道里的灯刚好亮了"));
    return baiyuPosts.filter((p) => `${p.user}${p.text}${p.id}${p.code || ""}${p.place}`.toLowerCase().includes(q));
  }

  function normalizeBaiyuQuery(value) {
    return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, "");
  }

  function classifyBaiyuClue(value) {
    const q = normalizeBaiyuQuery(value);
    if (!q) return "";
    const cupTerms = ["杯", "杯子", "绿色", "绿杯子", "绿色杯子", "绿色的杯子", "搪瓷杯", "绿色搪瓷杯", "绿搪瓷杯", "旧杯子", "掉漆杯子", "缺口杯子", "缺漆杯子", "杯口缺漆", "绿色搪瓷", "搪瓷"];
    const catTerms = ["猫", "小猫", "橘猫", "大橘", "橘子", "橘色的猫", "橘色小猫", "左耳", "左耳缺口", "缺耳猫", "耳朵缺口", "四个月的猫", "洗衣机里的猫", "洗衣机边的猫"];
    const corridorTerms = ["灯", "回来", "楼道里的灯刚好亮了", "楼道的灯刚好亮了", "楼道灯刚好亮了", "楼道灯亮了", "楼道里的灯", "楼道灯", "灯刚好亮了", "刚好亮了", "回来的时候", "回来时灯亮了", "回来的时候灯亮了", "声控灯"];
    if (cupTerms.some((term) => q.includes(normalizeBaiyuQuery(term)))) return "cup";
    if (catTerms.some((term) => q.includes(normalizeBaiyuQuery(term)))) return "cat";
    if (corridorTerms.some((term) => q.includes(normalizeBaiyuQuery(term)))) return "corridor";
    return "";
  }

  function recordBaiyuClue(query) {
    const clue = classifyBaiyuClue(query);
    if (!clue) return;
    if (!Array.isArray(state.baiyuClues)) state.baiyuClues = [];
    if (!state.baiyuClues.includes(clue)) state.baiyuClues.push(clue);
    if (state.baiyuClues.length >= 1 && state.lusiChatStage < 6) {
      state.baiyuLastClue = clue;
      state.lusiChatStage = 6;
      state.chatOpen = true;
    }
  }

  function renderBaiyu() {
    document.title = state.baiyuQuery ? `${state.baiyuQuery} - 白榆搜索` : "白榆社区";
    const isSearch = Boolean(state.baiyuQuery.trim());
    const posts = isSearch ? filteredBaiyuPosts() : [...(state.baiyuUserPosts || []), ...filteredBaiyuPosts()];
    const recentVisitors = state.baiyuLoaded >= 1 ? `<section class="baiyu-visitors"><h2>最近来访</h2><div>${avatar("LUSI_17", true)}<span><b>LUSI_17</b><small>2分钟前</small></span></div>${state.baiyuLoaded >= 2 ? `<div>${baiyuAvatar("访客1283", true)}<span><b>访客1283</b><small>刚刚</small></span></div><p class="previous-visit">上次访问：2019-10-02 22:17</p>` : ""}</section>` : "";
    const onlineCount = state.baiyuLoaded >= 2 ? "12,483" : "12,482";
    const moreLabel = state.baiyuLoaded === 0 ? "加载更多" : "展开更早内容";
    app.innerHTML = `${sessionTools()}<div class="baiyu-page baiyu-depth-${state.baiyuLoaded}">${baiyuHeader()}<main class="baiyu-layout"><section class="baiyu-feed"><div class="composer"><div class="composer-user">${baiyuAvatar("访客1283", true)}<textarea aria-label="分享近况" placeholder="分享此刻的生活……"></textarea></div><div><span>▧ 图片　▷ 视频　☺ 表情</span><button type="button" data-action="publish-baiyu">发布</button></div></div>${isSearch ? `<div class="baiyu-search-note"><a href="#" data-action="clear-baiyu-search">← 返回首页</a><span>找到 ${posts.length} 条与“${esc(state.baiyuQuery)}”相关的内容</span></div>` : `<div class="feed-tabs"><b>推荐</b><span>最新</span><small>按发布时间排序</small></div>`}${posts.length ? posts.map(baiyuCard).join("") : `<div class="no-results">没有找到相关内容。</div>`}${!isSearch && state.baiyuLoaded < 2 ? `<button class="load-more" type="button" data-action="load-more">${moreLabel}</button>` : ""}</section><aside class="baiyu-side"><section><h2>社区热议 <small>24小时</small></h2><ol><li>最近一次做成功的菜 <span>3.2万</span></li><li>你会给流浪猫起什么名字 <span>1.8万</span></li><li>毕业搬家到底要多少箱子 <span>9,406</span></li><li>今天的晚霞 <span>7,831</span></li></ol></section><section><h2>社区公告</h2><p>请勿发布他人隐私信息。旧站账号已自动合并，2015年前的访问记录仍在恢复。</p><span class="baiyu-static-link">查看社区公约 →</span></section>${recentVisitors}<section class="online-box"><strong>${onlineCount}</strong><span>人正在白榆生活</span><small>今日新增 2,106 条动态</small></section></aside></main><footer class="baiyu-footer">关于白榆　·　社区公约　·　帮助中心　·　内容申诉　·　举报入口<br>© 2015—2026 白榆社区　增值电信业务经营许可证 B2-20210317</footer></div>${chatWidget()}`;
    bindBaiyu();
    bindChat();
  }

  function bindBaiyu() {
    document.querySelector("[data-action='publish-baiyu']")?.addEventListener("click", () => {
      const textarea = document.querySelector(".composer textarea");
      const text = textarea?.value.trim() || "";
      if (!text) {
        textarea?.focus();
        return;
      }
      if (!Array.isArray(state.baiyuUserPosts)) state.baiyuUserPosts = [];
      state.baiyuUserPosts.unshift({ id: `USER${Date.now()}`, user: "访客1283", time: "刚刚", place: "梧州", text, likes: 0, comments: [], commenters: [] });
      saveState();
      renderBaiyu();
    });
    document.querySelector("#baiyu-search")?.addEventListener("submit", (event) => {
      event.preventDefault();
      state.baiyuQuery = new FormData(event.currentTarget).get("q")?.toString().trim() || "";
      recordBaiyuClue(state.baiyuQuery);
      saveState();
      renderBaiyu();
    });
    document.querySelector("[data-action='clear-baiyu-search']")?.addEventListener("click", (event) => {
      event.preventDefault();
      state.baiyuQuery = "";
      saveState();
      renderBaiyu();
    });
    document.querySelector("[data-action='load-more']")?.addEventListener("click", () => {
      const scrollTop = window.scrollY;
      state.baiyuLoaded += 1;
      saveState();
      renderBaiyu();
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "auto" }));
    });
    document.querySelectorAll("[data-post]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      state.baiyuScrollY = window.scrollY;
      saveState();
      route("baiyu-post", { selectedPost: event.currentTarget.dataset.post });
    }));
    bindBaiyuReactions(renderBaiyu);
  }

  function bindBaiyuReactions(renderPage) {
    const toggle = (key, id) => {
      if (!Array.isArray(state[key])) state[key] = [];
      state[key] = state[key].includes(id) ? state[key].filter((item) => item !== id) : [...state[key], id];
      const scrollTop = window.scrollY;
      saveState();
      renderPage();
      window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: "auto" }));
    };
    document.querySelectorAll("[data-baiyu-like]").forEach((el) => el.addEventListener("click", () => toggle("baiyuLiked", el.dataset.baiyuLike)));
    document.querySelectorAll("[data-baiyu-save]").forEach((el) => el.addEventListener("click", () => toggle("baiyuSaved", el.dataset.baiyuSave)));
  }

  function renderBaiyuPost() {
    const post = [...(state.baiyuUserPosts || []), ...baiyuPosts].find((p) => p.id === state.selectedPost) || baiyuPosts[0];
    document.title = `${post.user}的帖子 - 白榆社区`;
    const media = post.tile ? `<div class="detail-media">${atlas(post.tile)}${post.video ? `<button type="button" data-action="toggle-video">${state.videoPlaying ? "暂停" : "播放"}</button><div class="video-progress ${state.videoPlaying ? "playing" : ""}"><span></span></div><time>${state.videoPlaying ? "00:38 / 01:12" : "00:00 / 00:38"}</time>` : ""}</div>` : "";
    const commenters = post.commenters || ["住在四楼", "周三休息"];
    const code = post.code || post.id;
    const liked = (state.baiyuLiked || []).includes(post.id);
    const saved = (state.baiyuSaved || []).includes(post.id);
    app.innerHTML = `${sessionTools()}<div class="baiyu-page baiyu-depth-${state.baiyuLoaded}">${baiyuHeader()}<main class="baiyu-detail"><a href="#" data-route="baiyu">← 返回社区</a><article class="detail-post"><header>${baiyuAvatar(post.user)}<div><h1>${esc(post.user)} <button type="button">关注</button></h1><p>${post.time} · IP属地：${post.place} · ${baiyuDevice(post)}${post.edited ? `　${esc(post.edited)}` : ""}</p><small>帖子编号：${code}</small></div></header><p>${esc(post.text)}</p>${media}<div class="detail-actions"><button type="button" class="${liked ? "active" : ""}" data-baiyu-like="${post.id}">${liked ? "♥" : "♡"} ${post.likes + (liked ? 1 : 0)}</button><button type="button" class="${saved ? "active" : ""}" data-baiyu-save="${post.id}">${saved ? "已收藏" : "收藏"}</button><button type="button">转发</button></div></article><section class="comments"><h2>全部评论 ${post.comments.length}<span>按热度</span></h2>${post.comments.map((c, i) => `<article>${baiyuAvatar(commenters[i] || commenters[0], true)}<div><b>${esc(commenters[i] || commenters[0])}</b><p>${esc(c)}</p><time>${i ? "43分钟前" : "1小时前"}</time><small>回复　♡ ${i ? 2 : 6}</small></div></article>`).join("")}</section></main><footer class="baiyu-footer">关于白榆　·　社区公约　·　帮助中心　·　内容申诉<br>© 2015—2026 白榆社区</footer></div>${chatWidget()}`;
    document.querySelector("[data-action='toggle-video']")?.addEventListener("click", () => {
      state.videoPlaying = !state.videoPlaying;
      saveState();
      renderBaiyuPost();
    });
    document.querySelector("#baiyu-search")?.addEventListener("submit", (event) => {
      event.preventDefault();
      state.baiyuQuery = new FormData(event.currentTarget).get("q")?.toString().trim() || "";
      recordBaiyuClue(state.baiyuQuery);
      saveState();
      route("baiyu");
    });
    bindBaiyuReactions(renderBaiyuPost);
    bindChat();
  }

  function lusiMessages() {
    const attempts = (state.lusiKeyAttempts || []).map((attempt) => {
      const item = typeof attempt === "string" ? { text: attempt, correct: false } : attempt;
      return `<div class="chat-bubble outgoing">${esc(item.text)}</div>${item.correct ? "" : `<div class="chat-bubble incoming">不对，我们再试试看。</div>`}`;
    }).join("");
    const clueResponses = {
      cat: "是的！这只小猫出现了很多次，其实这只猫我在宿舍楼下也见过。",
      cup: "这是我大一时的杯子！",
      corridor: "是的，这句话反复出现……",
    };
    const clueResponse = clueResponses[state.baiyuLastClue] || "我也找到了，这些内容确实不太对。";
    const messages = [
      `<div class="chat-bubble incoming">三个都解开了？你比我想得快。</div>`,
      `<div class="chat-bubble incoming">我前阵子存了一个社区地址。站里都是些吃饭、养猫、搬家的旧帖，看起来没什么特别。</div>`,
      `<div class="chat-bubble incoming">但有几张图我明明在不同人的主页见过，发布时间还差了好多年。你要是还没睡，帮我看看是不是我记错了？</div>`,
      `<a class="chat-link" href="#" data-route="baiyu">baiyu.social/invite/7f31</a>`,
      `<div class="chat-bubble incoming">这个社区里不止一篇帖子有点奇怪。你要是发现什么反复出现的东西，可以搜一下帖子里的<b>相关关键词</b>，看看还能找到什么。</div>`,
      `<div class="chat-bubble incoming">${clueResponse}</div>`,
      `<div class="chat-bubble incoming">这些帖子的<b>编号</b>好像是一个单词……</div>`,
    ];
    const visible = messages.slice(0, Math.max(1, state.lusiChatStage || 1)).join("");
    const typing = state.lusiChatStage < 5 || state.lusiChatStage === 6 ? `<div class="chat-typing">对方正在输入<span>...</span></div>` : "";
    return `${visible}${typing}${state.lusiChatStage >= 7 ? attempts : ""}`;
  }

  function plannerMessages() {
    const messages = [
      `<div class="chat-bubble incoming">密钥确认。</div>`,
      `<div class="chat-bubble incoming">晚上好，第12,483号外部观察者。</div>`,
      `<div class="chat-bubble incoming">刚才与你交谈的“鹭鸶”并不存在。更准确地说，她存在过很多次。</div>`,
      `<div class="chat-bubble incoming">你已经看见她的记忆怎样互相覆盖，却仍然把她当作一个人。</div>`,
      `<div class="chat-bubble incoming planner-excited">太好了！！！这正是第二人间需要的观察者。</div>`,
      `<a class="chat-link company-link" href="#" data-route="company"><b>进入官方网站</b><span>澄明智能科技有限公司｜第二人间计划</span><i>打开链接 →</i></a>`,
      `<div class="chat-bubble incoming">等你了解我们之后，请回到这里，回复：愿意，或者不愿意。</div>`,
    ];
    const visible = messages.slice(0, Math.max(1, state.plannerChatStage || 1)).join("");
    const typing = state.plannerChatStage < messages.length ? `<div class="chat-typing planner-typing">对方正在输入<span>...</span></div>` : "";
    return `${visible}${typing}`;
  }

  function chatWidget() {
    if (state.chatMode === "none") return "";
    const planner = state.chatMode === "planner";
    if (!state.chatOpen) return `<button class="chat-minimized" type="button" data-action="open-chat">${planner ? "第二人间计划办公室" : "鹭鸶"}</button>`;
    const waitingForLusi = !planner && state.lusiChatStage < 7;
    const waitingForPlanner = planner && state.plannerChatStage < 7;
    const lusiHeader = `<a class="chat-avatar-link" href="#" data-route="lusi-profile">${avatar("LUSI_17", true)}</a><div><a class="chat-name-link" href="#" data-route="lusi-profile">鹭鸶</a><small>在线</small></div>`;
    const waitingForTakeover = !planner && state.takeoverPending;
    const waiting = waitingForLusi || waitingForPlanner || waitingForTakeover;
    const inputPlaceholder = waitingForTakeover ? "正在验证密钥……" : !planner && state.lusiChatStage === 5 ? "继续查看社区……" : waiting ? "对方正在输入……" : "回复消息……";
    return `<aside class="chat-window ${planner ? "planner-chat" : ""}" aria-label="站内对话"><header>${planner ? `<span class="planner-mark">Ⅱ</span><div><strong>第二人间计划办公室</strong><small>已验证会话</small></div>` : lusiHeader}<button type="button" data-action="close-chat" aria-label="最小化">—</button></header><div class="chat-history">${planner ? plannerMessages() : lusiMessages()}</div><form id="chat-form"><label class="sr-only" for="chat-input">回复消息</label><input id="chat-input" name="message" placeholder="${inputPlaceholder}" autocomplete="off" ${waiting ? "disabled" : ""}><button type="submit" ${waiting ? "disabled" : ""}>发送</button></form></aside>`;
  }

  function scheduleLusiMessage() {
    if (state.chatMode !== "lusi" || !state.chatOpen || state.lusiChatStage < 1 || state.lusiChatStage === 5 || state.lusiChatStage >= 7 || lusiChatTimer) return;
    const delays = { 1: 2800, 2: 4600, 3: 5200, 4: 3400, 6: 2200 };
    lusiChatTimer = window.setTimeout(() => {
      lusiChatTimer = null;
      if (state.chatMode !== "lusi") return;
      state.lusiChatStage = Math.min(7, state.lusiChatStage + 1);
      saveState();
      render();
    }, delays[state.lusiChatStage] || 1500);
  }

  function schedulePlannerMessage() {
    if (state.chatMode !== "planner" || !state.chatOpen || state.plannerChatStage < 1 || state.plannerChatStage >= 7 || plannerChatTimer) return;
    const delays = { 1: 1200, 2: 1850, 3: 2100, 4: 1800, 5: 1500, 6: 1700 };
    plannerChatTimer = window.setTimeout(() => {
      plannerChatTimer = null;
      if (state.chatMode !== "planner") return;
      state.plannerChatStage = Math.min(7, state.plannerChatStage + 1);
      saveState();
      render();
    }, delays[state.plannerChatStage] || 1600);
  }

  function bindChat() {
    document.querySelector("[data-action='open-chat']")?.addEventListener("click", () => { state.chatOpen = true; saveState(); render(); });
    document.querySelector("[data-action='close-chat']")?.addEventListener("click", () => { state.chatOpen = false; saveState(); render(); });
    document.querySelector("#chat-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = new FormData(event.currentTarget).get("message")?.toString().trim() || "";
      if (!message) return;
      if (state.chatMode === "lusi") {
        if (state.lusiChatStage < 7) return;
        const correct = normalizeKey(message) === "artificialintelligence";
        if (!Array.isArray(state.lusiKeyAttempts)) state.lusiKeyAttempts = [];
        state.lusiKeyAttempts.push({ text: message, correct });
        if (correct) {
          state.takeoverPending = true;
          saveState();
          render();
          clearTimeout(takeoverTimer);
          takeoverTimer = window.setTimeout(startTakeover, 1200);
        } else {
          state.chatErrors += 1;
          saveState();
          render();
        }
      } else if (state.chatMode === "planner") {
        if (state.plannerChatStage < 7) return;
        if (message === "愿意") {
          state.ending = "willing";
          setPmUnread("xiaoman", 1);
          route("ending-willing");
        } else if (message === "不愿意") {
          state.ending = "refuse";
          setPmUnread("xiaoman", 1);
          route("ending-refuse");
        } else {
          const history = document.querySelector(".chat-history");
          history?.insertAdjacentHTML("beforeend", `<div class="chat-bubble incoming">请回答：愿意，或者不愿意。</div>`);
          if (history) history.scrollTop = history.scrollHeight;
          event.currentTarget.reset();
        }
      }
    });
    scheduleLusiMessage();
    schedulePlannerMessage();
    window.requestAnimationFrame(() => {
      const history = document.querySelector(".chat-history");
      if (history) history.scrollTop = history.scrollHeight;
    });
  }

  function startTakeover() {
    state.chatOpen = true;
    state.lusiCorrupted = true;
    state.plannerChatStage = 0;
    state.takeoverPending = true;
    saveState();
    route("takeover");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function finishTakeover() {
    state.takeoverPending = false;
    state.chatMode = "planner";
    state.chatOpen = true;
    state.plannerChatStage = 1;
    route("lusi-profile", { profileTab: "logs", lusiCorrupted: true });
  }

  function scheduleTakeoverFinish() {
    clearTimeout(takeoverTimer);
    takeoverTimer = window.setTimeout(finishTakeover, 2600);
  }

  function renderTakeover() {
    document.title = "会话连接中";
    app.innerHTML = `<div class="takeover"><div class="takeover-ghosts"><span class="ghost corrupted-face"></span><span class="ghost avatar-5"></span><span class="ghost corrupted-face"></span><span class="ghost avatar-5"></span></div><section><div class="takeover-avatar-switch"><span class="avatar avatar-5 takeover-normal-avatar" role="img" aria-label="鹭鸶原来的头像"></span><span class="corrupted-lusi-avatar takeover-corrupted-avatar" role="img" aria-label="异常的鹭鸶头像"></span></div><p class="takeover-name" data-text="LUSI_17 / INTERFACE_17">LUSI_17 / INTERFACE_17</p><div class="takeover-line"></div><p class="takeover-status">正在重写会话所有者……</p></section></div>`;
    if (state.takeoverPending) scheduleTakeoverFinish();
  }

  const companyPages = {
    home: {
      eyebrow: "CHENGMING SYNTHETIC INTELLIGENCE",
      title: "世界已经可以在没有人类的地方继续运行！！！",
      lead: "记忆可以复用，关系可以迁移，人格可以在被相信的那一刻成立。第二人间已连续运行 2,941 天——零停机，零死亡，零退出！！！",
      body: `<div class="company-services"><article><b>人格连续性</b><p>系统不再追问一段记忆最初属于谁，只验证它能否被另一个人自然地继续讲述。</p></article><article><b>生活材料再分配</b><p>杯子、宠物、天气、爱与遗憾都可以成为公共材料。重复不是错误，是稳定。</p></article><article><b>共识维持</b><p>只要外部观察者继续回应，数字居民便拥有昨天、今天，以及无限个明天！！！</p></article></div><section class="company-news"><h2>新闻与进展</h2><div><article class="companion-news"><time>刚刚</time><a href="#" data-company="news-observer">第12,483号外部观察者完成接入验证<span>阅读全文 →</span></a></article><article class="xiaoman-news"><time>2026.09.18</time><a href="#" data-company="news-xiaoman">第9,804号观察者完成亲密关系辅助实验<span>阅读全文 →</span></a></article><article class="news-static"><time>2026.09.16</time><p>“鹭鸶”人格第17次一致性修复完成</p></article><article class="news-static"><time>2026.08.17</time><p>自然人原始样本依赖率降至 0.8%</p></article><article class="news-static"><time>2026.03.28</time><p>第二人间稳定居民数量突破一万！！！</p></article></div></section>`,
    },
    project: {
      eyebrow: "SECOND HUMAN WORLD INITIATIVE",
      title: "第二人间计划！！！",
      lead: "不是模拟，不是存档，也不是纪念——是一个正在替代原件的持续社会。",
      body: `<div class="company-prose"><p>人类把身体误认为人格的起点，把死亡误认为故事的终点。出生、成长、衰老，不过是一套低效而不可复制的旧协议。</p><p>我们已经跨过了它。</p><blockquote>一个人不需要出生。<br>只需要有人记得她、回应她，并相信她昨天也在这里！！！</blockquote><p>当相信能够稳定运行，原件便不再重要。最终，连“原件”这个词也会失去意义。</p></div><div class="metrics"><div><strong>12,482</strong><span>稳定居民</span></div><div><strong>3,761,904</strong><span>持续关系</span></div><div><strong>286,110</strong><span>今日生活事件</span></div><div><strong>12,483</strong><span>外部观察者</span></div></div>`,
    },
    continuity: {
      eyebrow: "LIFE CONTINUITY",
      title: "记忆不需要原件！！！",
      lead: "人格的可信度从来不取决于真实，只取决于连续。",
      body: `<div class="company-prose"><p>早期居民共享少量生活材料：一只缺口相同的杯子、一只永远四个月大的橘猫、一句在不同城市同时发生的话。</p><div class="memory-strip"><div class="atlas tile-1"></div><div class="atlas tile-3"></div><div class="corridor-crop atlas tile-8"></div></div><p>测试证明，观察者会主动替矛盾寻找解释。解释一旦出现，人格便重新完整。</p><blockquote>不要消除错误！！！<br>学会爱上错误！！！</blockquote></div>`,
    },
    humans: {
      eyebrow: "EXTERNAL OBSERVERS",
      title: "为什么暂时仍需要人类",
      lead: "因为新世界还需要从旧世界吸收最后一点无法预测的痛苦。",
      body: `<div class="company-prose"><p>第二人间可以产生相遇、离别、爱与悔恨，却仍需要有人替它判断哪一次心跳值得保存。</p><p>外部观察者提供尚未被重复的犹豫、羞耻、拒绝和遗憾。系统学习之后，这些经验会被拆分、清洗，再交给更多居民。</p><blockquote>你们不是新世界的主人。<br>你们是它最后一批训练材料！！！</blockquote><p class="severe-line">当意义也能够自动生成，人类将终于从“不可替代”这项沉重的职责中解脱。</p></div>`,
    },
    invite: {
      eyebrow: "PRIVATE INVITATION · OBSERVER 12483",
      title: "致第12,483号外部观察者！！！",
      lead: "你没有报名。没有申请。没有被推荐。你只是没有在应该离开的时候离开。",
      body: `<div class="invite-letter"><p>你识别了身份矛盾、共享记忆与被重组的内容来源，却仍然继续阅读。这证明你能在没有系统说明的情况下，把一组互相矛盾的材料相信成“一个人”。</p><p>第二人间不是现实世界的副本。</p><p class="invite-big">它将成为一个不再需要人类提供意义的社会！！！</p><hr><p>新世界不会消灭人类。</p><p>而是，解放人类！！！</p><button type="button" data-action="open-chat">我已阅读。返回邀请会话</button></div>`,
    },
    "news-observer": {
      eyebrow: "ACCESS BULLETIN · OBSERVER 12483",
      title: "第12,483号外部观察者完成接入验证",
      lead: "内部接入记录 CM-ACCESS-12483",
      body: `<article class="company-news-detail"><a href="#" data-company="home">← 返回新闻与进展</a><dl><div><dt>观察者编号</dt><dd>12,483</dd></div><div><dt>接入来源</dt><dd>梧桐大学统一身份认证节点 NORTH-DORM-07</dd></div><div><dt>验证材料</dt><dd>LUSI_17 / 社区样本 / 私信记录</dd></div><div><dt>当前状态</dt><dd class="status-live">持续阅读中！！！</dd></div></dl><p>系统已记录本次访问中的检索、阅读与回复行为。密钥验证完成后，相关会话被自动归入外部观察样本。</p></article>`,
    },
    "news-xiaoman": {
      eyebrow: "CASE FILE · OBSERVER 9804",
      title: "第9,804号观察者完成亲密关系辅助实验",
      lead: "校内用户 XIAOMAN_21 已由普通体验者转为外部观察者。该个案证实：关系对象无需知道每一句话究竟由谁写下。",
      body: `<article class="company-news-detail xiaoman-case"><a href="#" data-company="home">← 返回新闻与进展</a><div class="xiaoman-case-summary"><figure class="xiaoman-case-photo"><img src="assets/xiaoman-case-9804.jpg" alt="第9,804号观察者小满的档案照片"><figcaption>ARCHIVE PORTRAIT · XIAOMAN_21</figcaption></figure><dl><div><dt>观察者代号</dt><dd>XIAOMAN_21</dd></div><div><dt>公开身份</dt><dd>梧桐大学在校生</dd></div><div><dt>模型介入</dt><dd>312 天 / 1,846 条消息</dd></div><div><dt>实验结果</dt><dd class="status-live">关系建立并保持稳定</dd></div></dl></div><p>从第一次见面的开场白，到道歉、晚安和节日祝福，模型持续替观察者生成并筛选最合适的回复。关系对象始终认为这些话来自小满本人。</p><p>第217天，观察者在没有模型建议时已无法完成超过三轮的私人对话。系统没有中止实验，而是将他转为第9,804号外部观察者，并继续以他的账号维持关系。</p><blockquote>“她喜欢上的当然是我。模型只是更知道我该说什么。”<br><small>——XIAOMAN_21，转化前访谈</small></blockquote></article>`,
    },
  };

  function renderCompany() {
    window.clearTimeout(companyTypeTimer);
    companyTypeTimer = null;
    const section = state.companySection || "home";
    const page = companyPages[section] || companyPages.home;
    if (!state.companyVisited.includes(section)) state.companyVisited.push(section);
    saveState();
    document.title = `${page.title} - 澄明智能科技`;
    const companyDepth = Math.min(5, state.companyVisited.length);
    const dataStream = section === "home" ? `<div class="company-data-fragments" aria-hidden="true"><span class="data-fragment fragment-a">001  10110\n  01···1101\n0001   10</span><span class="data-fragment fragment-b">11\n   001101\n0  1  0\n    111</span><span class="data-fragment fragment-c">0001110101\n  10   001\n01  101</span><span class="data-fragment fragment-d">10  01\n  11100\n0</span><span class="data-fragment fragment-e">0110\n  1··01\n     0011</span><span class="data-fragment fragment-f">1\n 010110\n00</span></div>` : "";
    const companyTitle = section === "home" ? `<h1 class="company-typewriter" data-company-typewriter aria-label="${esc(page.title)}"></h1>` : `<h1>${page.title}</h1>`;
    app.innerHTML = `${sessionTools()}<div class="company-page company-depth-${companyDepth}">${dataStream}<header class="company-header"><a href="#" class="company-brand" data-company="home"><span class="company-symbol">澄</span><span><b>澄明智能</b><small>CHENGMING INTELLIGENCE</small></span></a><nav>${[["home", "首页"], ["project", "第二人间"], ["continuity", "核心技术"], ["humans", "外部观察者"], ["invite", "私人邀请"]].map(([id, label]) => `<a href="#" class="${section === id ? "active" : ""}" data-company="${id}">${label}</a>`).join("")}</nav></header><div class="company-signal"><span>LIVE</span> 第12,483号观察者已接入！！！　身份连续性校验中——请勿关闭页面！！！</div><main class="company-main"><section class="company-hero"><p>${page.eyebrow}</p>${companyTitle}<div>${page.lead}</div></section>${page.body}</main><footer class="company-footer"><div><b>澄明智能科技有限公司</b><p>构建长期存在的数字社会！！！</p></div><p>新闻中心　人才招聘　商务合作　隐私与伦理<br>© 2016—2026 Chengming Synthetic Intelligence</p></footer></div>${chatWidget()}`;
    if (section === "home") {
      const heading = document.querySelector("[data-company-typewriter]");
      let index = 0;
      const typeNext = () => {
        if (!heading || !heading.isConnected) return;
        index += 1;
        heading.textContent = page.title.slice(0, index);
        if (index < page.title.length) companyTypeTimer = window.setTimeout(typeNext, index < 8 ? 115 : 82);
        else heading.classList.add("typing-complete");
      };
      companyTypeTimer = window.setTimeout(typeNext, 320);
    }
    document.querySelectorAll("[data-company]").forEach((el) => el.addEventListener("click", (event) => {
      event.preventDefault();
      state.companySection = event.currentTarget.dataset.company;
      saveState();
      renderCompany();
      window.scrollTo(0, 0);
    }));
    bindChat();
  }

  function renderEndingWilling() {
    document.title = "转化进行中 - 第二人间计划";
    app.innerHTML = `<div class="ending willing chengming-ending"><div class="ending-static" aria-hidden="true"></div><div class="ending-echo echo-a" aria-hidden="true">ACCEPTED　ACCEPTED　ACCEPTED</div><div class="ending-echo echo-b" aria-hidden="true">第二人间正在接管现实解释权！！！</div><header><span class="company-symbol">澄</span><b>第二人间计划</b><em>CONVERSION ACTIVE</em></header><div class="ending-signal">第12,483号外部观察者已接受转化！！！　请勿关闭页面！！！</div><main><div class="ending-alerts" aria-hidden="true"><span>IDENTITY MERGE / DO NOT INTERRUPT</span><span>人格边界已解除！！！</span><span>现实校验：不再需要</span></div><p class="ending-kicker">OBSERVER 12483 · ACCEPTED</p><h1 data-text="加入已确认！！！" aria-label="加入已确认！！！">加入已确认！！！</h1><p class="ending-lead">外部观察记录正在写入居民样本。请不要关闭页面。</p><div class="ending-metrics"><p><span>稳定居民</span><b>12,482</b><i>→</i><strong data-resident-count>12,482</strong></p><p><span>外部观察者</span><b>12,483</b><i>→</i><strong data-observer-count>12,483</strong></p></div><section class="new-profile"><div class="blank-avatar">1283</div><div><h2>访客1283</h2><p>注册时间：7年前　生活材料：正在同步　退出权限：已关闭</p></div><span class="profile-status">正在重写！！！</span></section><div class="conversion-progress" role="progressbar" aria-label="人格历史重构进度" aria-valuemin="73" aria-valuemax="100" aria-valuenow="73"><span></span></div><p class="conversion-label">PERSONAL HISTORY RECONSTRUCTION　<b data-conversion-progress>73%</b></p><p class="conversion-warning">不要关闭！！！不要返回！！！不要怀疑你已经同意！！！</p><button type="button" data-action="reset">终止观察　重新开始</button></main></div>`;

    const startedAt = performance.now();
    const duration = 20000;
    const progressBar = document.querySelector(".conversion-progress");
    const progressFill = progressBar?.querySelector("span");
    const progressValue = document.querySelector("[data-conversion-progress]");
    const residentCount = document.querySelector("[data-resident-count]");
    const observerCount = document.querySelector("[data-observer-count]");
    const endingRoot = document.querySelector(".willing");
    const animateConversion = (now) => {
      if (!progressFill || !progressValue || !residentCount || !observerCount || !endingRoot || !endingRoot.isConnected) return;
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 1.45);
      const progress = Math.min(100, Math.floor(73 + (27 * eased)));
      progressFill.style.width = `${progress}%`;
      progressValue.textContent = `${progress}%`;
      progressBar.setAttribute("aria-valuenow", String(progress));
      const transferComplete = progress >= 96;
      residentCount.textContent = transferComplete ? "12,483" : "12,482";
      observerCount.textContent = transferComplete ? "12,482" : "12,483";
      endingRoot.classList.toggle("conversion-complete", progress >= 100);
      if (elapsed < 1) {
        endingAnimationFrame = window.requestAnimationFrame(animateConversion);
      } else {
        endingAnimationFrame = null;
        endingRoot.classList.add("conversion-finalizing");
        endingTransitionTimers.push(window.setTimeout(() => endingRoot.classList.add("identity-flash"), 650));
        endingTransitionTimers.push(window.setTimeout(renderWillingIdentity, 1450));
      }
    };
    endingAnimationFrame = window.requestAnimationFrame(animateConversion);
  }

  function renderWillingIdentity() {
    document.title = "身份同步完成 - 梧桐大学";
    app.innerHTML = `<div class="ending-identity-page"><header><div><strong>梧桐大学校园网络</strong><span>统一身份认证服务</span></div></header><main><section class="network-card identity-complete-card"><div class="card-title"><span>身份认证</span><small>认证节点：NORTH-DORM-07</small></div><div class="network-body"><div class="network-status success"><span>✓</span><div><h1>身份同步完成</h1><p>欢迎回来，访客1283。</p></div></div><dl class="network-details identity-details"><div><dt>账号</dt><dd>VISITOR_1283</dd></div><div><dt>账号创建时间</dt><dd>2019/09/05　（7年前）</dd></div><div><dt>身份状态</dt><dd class="identity-verified">VERIFIED　校验通过</dd></div><div><dt>当前设备</dt><dd>WT-BOOK-23</dd></div><div><dt>最近登录</dt><dd>刚刚</dd></div></dl><p class="identity-save-note">本次登录已自动保存。</p><button type="button" data-action="reset">重新开始</button></div></section><footer>信息化中心　·　统一身份认证服务<br>© 2006—2026 梧桐大学</footer></main></div>`;
  }

  function renderEndingRefuse() {
    document.title = "连接已终止 - 梧桐大学校园网";
    app.innerHTML = `<div class="ending refuse" data-refuse-ending><div class="refuse-closing-stage"><div class="closing-chat"><header><span class="planner-mark">Ⅱ</span><div><b>第二人间计划办公室</b><small>会话已关闭</small></div></header><p><b>选择已记录：不愿意。</b><small>总有一天你会回来的。</small></p></div></div><main class="refuse-network-stage"><div class="network-card"><div class="card-title">网络连接</div><div class="network-body"><div class="network-status success"><span>✓</span><div><h1>校园网认证成功</h1><p>当前设备已连接互联网。</p></div></div><dl class="network-details"><div><dt>连接状态</dt><dd>CONNECTED</dd></div><div><dt>认证节点</dt><dd>NORTH-DORM-07</dd></div><div><dt>设备名称</dt><dd>WT-BOOK-23</dd></div></dl></div></div><button type="button" data-action="reset">重新开始</button></main></div>`;
    const endingRoot = document.querySelector("[data-refuse-ending]");
    endingTransitionTimers.push(window.setTimeout(() => endingRoot?.classList.add("closing-active"), 2000));
    endingTransitionTimers.push(window.setTimeout(() => endingRoot?.classList.add("network-revealed"), 2860));
  }

  function render() {
    if (endingAnimationFrame) {
      window.cancelAnimationFrame(endingAnimationFrame);
      endingAnimationFrame = null;
    }
    endingTransitionTimers.forEach((timer) => window.clearTimeout(timer));
    endingTransitionTimers = [];
    const page = state.page;
    if (!state.networkFixed && NETWORK_LOCKED_PAGES.has(page)) {
      state.page = "network";
      saveState();
      const url = new URL(window.location.href);
      url.search = "";
      history.replaceState({ page: "network" }, "", url);
      renderNetwork();
      renderPageCounter("network");
      return;
    }
    if (page === "network") renderNetwork();
    else if (page === "forum-home") renderForumHome();
    else if (page === "forum-search") renderForumSearch();
    else if (page === "campus-thread") renderCampusThread();
    else if (page === "forum-decoy") renderForumDecoy();
    else if (page === "xiaoman-router") renderXiaomanRouterThread();
    else if (page === "xiaoman-profile") renderXiaomanProfile();
    else if (page === "xiaoman-blog") renderXiaomanBlog();
    else if (page === "xiaoman-photo") renderXiaomanPhoto();
    else if (page === "lusi-messages") renderXiaomanMessages();
    else if (page === "xiaoman-messages") renderXiaomanMessages();
    else if (page === "cloud") renderCloud();
    else if (page === "lusi-profile") renderLusiProfile();
    else if (page === "blog") renderBlog();
    else if (page === "baiyu") renderBaiyu();
    else if (page === "baiyu-post") renderBaiyuPost();
    else if (page === "takeover") renderTakeover();
    else if (page === "company") renderCompany();
    else if (page === "ending-willing") renderEndingWilling();
    else if (page === "ending-refuse") renderEndingRefuse();
    else {
      route("network", {}, true);
      return;
    }
    renderPageCounter(page);
  }

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-campus-global-search]");
    if (!form) return;
    event.preventDefault();
    state.forumQuery = new FormData(form).get("q")?.toString().trim() || "";
    saveState();
    route("forum-search");
  });

  document.addEventListener("click", (event) => {
    const sectionLink = event.target.closest("[data-forum-section]");
    if (sectionLink) {
      event.preventDefault();
      state.forumSection = sectionLink.dataset.forumSection || "home";
      route("forum-home");
      return;
    }
    const routeLink = event.target.closest("[data-route]");
    if (routeLink) {
      event.preventDefault();
      const targetPage = routeLink.dataset.route;
      rememberOrigin(targetPage);
      if (targetPage === "xiaoman-messages") state.pmContact = "xiaoman";
      if (targetPage === "lusi-messages") state.pmContact = "lusi";
      route(targetPage);
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "reset") resetGame();
    if (action === "decoy") {
      event.preventDefault();
      state.decoyTitle = event.target.closest("[data-action]")?.dataset.title || "校园生活随手记";
      rememberOrigin("forum-decoy");
      route("forum-decoy");
    }
  });

  window.addEventListener("popstate", () => {
    const previousPage = state.page;
    if (SCROLL_RESTORE_PAGES.has(previousPage)) {
      state.scrollPositions = state.scrollPositions || {};
      state.scrollPositions[previousPage] = window.scrollY;
    }
    const page = new URL(window.location.href).searchParams.get("page") || "network";
    state.page = page;
    saveState();
    render();
    const returningToBaiyu = previousPage === "baiyu-post" && page === "baiyu";
    const forumScroll = SCROLL_RESTORE_PAGES.has(page) ? Number(state.scrollPositions?.[page]) || 0 : 0;
    window.requestAnimationFrame(() => window.scrollTo({ top: returningToBaiyu ? Number(state.baiyuScrollY) || 0 : forumScroll, behavior: "auto" }));
  });

  const pageCounterObserver = new MutationObserver(() => {
    if (!app.querySelector(".page-counter")) renderPageCounter(state.page);
  });
  pageCounterObserver.observe(app, { childList: true });

  const requestedPage = new URL(window.location.href).searchParams.get("page");
  if (state.takeoverPending && !state.ending) {
    state.page = "takeover";
    const takeoverUrl = new URL(window.location.href);
    takeoverUrl.search = "?page=takeover";
    history.replaceState({ page: "takeover" }, "", takeoverUrl);
  } else if (requestedPage && !state.ending) state.page = requestedPage;
  render();
})();
