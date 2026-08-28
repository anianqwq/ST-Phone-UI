/**
 * ST-Phone-UI — SillyTavern 手机聊天UI扩展
 * 
 * 当角色回复中包含 <msg> 或 <rednote> 标签时，
 * 右下角出现手机图标，点击可展开手机界面查看消息。
 * 
 * 安装：将整个 ST-Phone-UI 文件夹放到
 *   <SillyTavern>/public/scripts/extensions/third-party/
 * 然后在酒馆的 扩展 → 第三方扩展 中启用。
 */

(function () {
  "use strict";

  // ============ 状态管理 ============
  const STATE = {
    messages: [],       // 解析后的聊天消息
    rednotes: [],       // 解析后的红书帖子
    contacts: [],       // 联系人列表
    currentTab: "chat", // chat | rednote | contacts
    visible: false,
    initialized: false,
    msgCount: 0,
    observer: null,
  };

  // ============ 拖拽功能 ============
  function makeDraggable(el, storageKey, options) {
    options = options || {};
    const handleSelector = options.handle || null;
    let startX, startY, startLeft, startTop;
    let isDragging = false;
    let dragMoved = false;
    const DRAG_THRESHOLD = 5;

    function onStart(e) {
      // 不拦截交互元素上的点击
      if (e.target.closest(".st-phone-tab, .st-phone-close, .st-phone-content, .st-chat-bubble-wrap, .st-rednote-card, .st-contact-item, .st-phone-tabbar")) {
        return;
      }
      if (handleSelector && !e.target.closest(handleSelector)) {
        return;
      }

      const point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      isDragging = true;
      dragMoved = false;
      el.classList.add("dragging");
      el.style.transition = "none";
      el.style.setProperty('right', 'auto', 'important');
      el.style.setProperty('bottom', 'auto', 'important');
      e.preventDefault();
    }

    function onMove(e) {
      if (!isDragging) return;
      const point = e.touches ? e.touches[0] : e;
      const dx = point.clientX - startX;
      const dy = point.clientY - startY;

      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        dragMoved = true;
      }

      // 限制不超出屏幕
      const newLeft = Math.max(0, Math.min(startLeft + dx, window.innerWidth - el.offsetWidth));
      const newTop = Math.max(0, Math.min(startTop + dy, window.innerHeight - el.offsetHeight));
      el.style.setProperty('left', newLeft + "px", 'important');
      el.style.setProperty('top', newTop + "px", 'important');
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      el.classList.remove("dragging");
      el.style.transition = "";

      if (dragMoved && storageKey) {
        const rect = el.getBoundingClientRect();
        const pos = { left: rect.left, top: rect.top };
        try {
          localStorage.setItem(storageKey, JSON.stringify(pos));
        } catch (e) {}
      }
    }

    // 恢复保存的位置
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const pos = JSON.parse(saved);
          el.style.setProperty('left', pos.left + "px", 'important');
          el.style.setProperty('top', pos.top + "px", 'important');
          el.style.setProperty('right', 'auto', 'important');
          el.style.setProperty('bottom', 'auto', 'important');
        }
      } catch (e) {}
    }

    // 鼠标事件
    el.addEventListener("mousedown", onStart);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);

    // 触摸事件（手机）
    el.addEventListener("touchstart", onStart, { passive: false });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);

    return {
      wasDragged: function () { return dragMoved; },
      resetDrag: function () { dragMoved = false; },
    };
  }

  // ============ 颜色池（用于联系人头像） ============
  const AVATAR_COLORS = [
    "#ff6b6b", "#ee5a24", "#f0932b", "#f9ca24",
    "#6ab04c", "#22a6b3", "#4834d4", "#be2edd",
    "#eb4d4b", "#30336b", "#535c68", "#c44569",
  ];

  function avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function avatarInitial(name) {
    return name.charAt(0).toUpperCase();
  }

  // ============ DOM 构建 ============
  function createPhoneUI() {
    if (document.getElementById("st-phone-container")) return;

    // 浮动按钮
    const btn = document.createElement("div");
    btn.id = "st-phone-floating-btn";
    btn.innerHTML = '📱<span class="badge" style="display:none">0</span>';
    btn.title = "拖动可随意移动位置 | 点击打开手机";

    // 先绑拖拽，再绑点击
    const btnDrag = makeDraggable(btn, "st-phone-btn-pos");
    btn.addEventListener("click", function (e) {
      if (btnDrag.wasDragged()) {
        btnDrag.resetDrag();
        return;
      }
      togglePhone();
    });
    document.body.appendChild(btn);

    // 手机容器
    const container = document.createElement("div");
    container.id = "st-phone-container";
    container.innerHTML = `
      <div class="st-phone-frame">
        <div class="st-phone-drag-handle"></div>
        <div class="st-phone-screen">
          <div class="st-phone-notch"></div>
          <div class="st-phone-statusbar">
            <span class="time" id="st-phone-time">9:41</span>
            <span class="icons">📶 🔋</span>
          </div>
          <div class="st-phone-content" id="st-phone-content">
            <div class="st-phone-empty">
              <span class="empty-icon">💬</span>
              <span>暂无消息</span>
            </div>
          </div>
          <div class="st-phone-tabbar">
            <div class="st-phone-tab active" data-tab="chat">
              <span class="tab-icon">💬</span>聊天
            </div>
            <div class="st-phone-tab" data-tab="rednote">
              <span class="tab-icon">📕</span>红书
            </div>
            <div class="st-phone-tab" data-tab="contacts">
              <span class="tab-icon">👥</span>联系人
            </div>
          </div>
        </div>
        <button class="st-phone-close" title="关闭">✕</button>
      </div>
    `;
    document.body.appendChild(container);

    // 手机容器拖拽（从手柄或状态栏拖动）
    makeDraggable(container, "st-phone-container-pos", { handle: ".st-phone-drag-handle,.st-phone-statusbar" });

    // 关闭按钮
    container.querySelector(".st-phone-close").addEventListener("click", () => {
      hidePhone();
    });

    // Tab 切换
    container.querySelectorAll(".st-phone-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        switchTab(tab.dataset.tab);
      });
    });

    // 更新状态栏时间
    updateTime();
    setInterval(updateTime, 60000);

    STATE.initialized = true;
  }

  function updateTime() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, "0");
    const m = now.getMinutes().toString().padStart(2, "0");
    const el = document.getElementById("st-phone-time");
    if (el) el.textContent = h + ":" + m;
  }

  // ============ 显示/隐藏 ============
  function togglePhone() {
    if (STATE.visible) {
      hidePhone();
    } else {
      showPhone();
    }
  }

  function showPhone() {
    const container = document.getElementById("st-phone-container");
    if (!container) return;
    container.classList.add("show");
    STATE.visible = true;
    renderCurrentTab();
    updateBadge(0);
  }

  function hidePhone() {
    const container = document.getElementById("st-phone-container");
    if (!container) return;
    container.classList.remove("show");
    STATE.visible = false;
  }

  // ============ 消息解析 ============
  function decodeHtmlEntities(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.innerHTML = text;
    return div.textContent || div.innerText || "";
  }

  function parseMessages(text) {
    if (!text) return [];
    const results = [];

    // 先解码可能的 HTML 实体（SillyTavern 可能转义显示 <msg> 为 &lt;msg&gt;）
    let decoded = text;
    if (text.indexOf("&lt;") !== -1 || text.indexOf("&gt;") !== -1) {
      decoded = decodeHtmlEntities(text);
    }

    // 匹配 <msg>...</msg>，支持多行内容
    const msgRegex = /<msg>([\s\S]*?)<\/msg>/gi;
    let match;
    while ((match = msgRegex.exec(decoded)) !== null) {
      const inner = match[1].trim();
      const parts = inner.split("|").map((p) => p.trim());

      let sender, receiver, content, time;

      if (parts.length >= 4) {
        [sender, receiver, content, time] = parts;
      } else if (parts.length === 3) {
        [sender, receiver, content] = parts;
        time = "";
      } else if (parts.length === 2) {
        [sender, content] = parts;
        receiver = "我";
        time = "";
      } else {
        sender = "对方";
        receiver = "我";
        content = parts[0] || inner;
        time = "";
      }

      let msgType = "text";
      let displayContent = content;

      if (content.startsWith("[bqb-")) {
        msgType = "sticker";
        displayContent = content.replace("[bqb-", "").replace("]", "");
      } else if (content.startsWith("[zz-")) {
        msgType = "transfer";
        const amount = content.replace("[zz-", "").replace("元]", "");
        displayContent = "💰 转账 " + amount + " 元";
      } else if (content.startsWith("[yy-")) {
        msgType = "voice";
        displayContent = content.replace("[yy-", "").replace("]", "");
      } else if (content.startsWith("[music-")) {
        msgType = "music";
        displayContent = content.replace("[music-", "").replace("]", "");
      } else if (content.startsWith("[img-")) {
        msgType = "image";
        displayContent = "📷 " + content.replace("[img-", "").replace("]", "");
      }

      const isGroup = receiver && receiver.startsWith("群:");

      results.push({
        type: "msg",
        msgType,
        sender: sender || "对方",
        receiver: receiver || "我",
        content: displayContent,
        rawContent: content,
        time: time || "",
        isGroup: !!isGroup,
        groupId: isGroup ? receiver.replace("群:", "") : null,
      });
    }

    if (results.length > 0) {
      console.log("[ST-Phone-UI] 解析到 " + results.length + " 条消息", results);
    }
    return results;
  }

  function parseRednotes(text) {
    if (!text) return [];
    const results = [];

    let decoded = text;
    if (text.indexOf("&lt;") !== -1 || text.indexOf("&gt;") !== -1) {
      decoded = decodeHtmlEntities(text);
    }

    // 解析帖子 <rednote>...</rednote>
    const noteRegex = /<rednote>([\s\S]*?)<\/rednote>/gi;
    let match;
    while ((match = noteRegex.exec(decoded)) !== null) {
      const parts = match[1].split("|");
      if (parts.length >= 8) {
        // 帖子格式: ID|发布者|一级标题|二级标题|内容|时间|点赞|收藏|评论
        results.push({
          type: "post",
          id: parts[0].trim(),
          author: parts[1].trim(),
          title1: parts[2].trim(),
          title2: parts[3].trim(),
          content: parts[4].trim(),
          time: parts[5].trim(),
          likes: parts[6].trim(),
          collects: parts[7].trim(),
          comments_count: parts[8] ? parts[8].trim() : "0",
          comments: [],
        });
      } else if (parts.length === 5) {
        // 评论格式: ID|评论人|内容|时间|点赞
        const postId = parts[0].trim();
        const comment = {
          author: parts[1].trim(),
          content: parts[2].trim(),
          time: parts[3].trim(),
          likes: parts[4].trim(),
        };
        // 找到对应帖子并添加评论
        const post = results.find((p) => p.id === postId);
        if (post) {
          post.comments.push(comment);
        } else {
          // 先存一个待关联的评论
          results.push({
            type: "orphan_comment",
            postId,
            comment,
          });
        }
      }
    }

    // 关联孤儿评论
    const orphanComments = results.filter((r) => r.type === "orphan_comment");
    results.forEach((r) => {
      if (r.type === "post") {
        orphanComments.forEach((oc) => {
          if (oc.postId === r.id) {
            r.comments.push(oc.comment);
          }
        });
      }
    });

    return results.filter((r) => r.type === "post");
  }

  function extractContacts(messages) {
    const contactMap = new Map();
    messages.forEach((m) => {
      if (m.sender && !m.isGroup) {
        if (!contactMap.has(m.sender)) {
          contactMap.set(m.sender, { name: m.sender, lastMsg: m.content, time: m.time });
        } else {
          const existing = contactMap.get(m.sender);
          // 保留最新的消息
          contactMap.set(m.sender, { ...existing, lastMsg: m.content, time: m.time });
        }
      }
      if (m.receiver && !m.isGroup && m.receiver !== "群:" && !contactMap.has(m.receiver)) {
        contactMap.set(m.receiver, { name: m.receiver, lastMsg: "", time: "" });
      }
    });
    return Array.from(contactMap.values());
  }

  // ============ 渲染 ============
  function renderCurrentTab() {
    switch (STATE.currentTab) {
      case "chat":
        renderChat();
        break;
      case "rednote":
        renderRednote();
        break;
      case "contacts":
        renderContacts();
        break;
    }
  }

  function getContentEl() {
    return document.getElementById("st-phone-content");
  }

  function renderChat() {
    const el = getContentEl();
    if (!el) return;

    if (STATE.messages.length === 0) {
      el.innerHTML = `
        <div class="st-phone-empty">
          <span class="empty-icon">💬</span>
          <span>暂无聊天消息</span>
        </div>
      `;
      return;
    }

    // 按时间排序
    const sorted = [...STATE.messages].sort((a, b) => {
      // 简单按添加顺序排
      return 0;
    });

    let html = "";
    sorted.forEach((m) => {
      if (m.isGroup) {
        html += `
          <div class="st-chat-bubble-wrap received">
            <div class="st-chat-sender">${escHtml(m.sender)} @群${escHtml(m.groupId)}</div>
            <div class="st-chat-bubble received group ${m.msgType}">
              ${renderMsgContent(m)}
            </div>
            <div class="st-chat-time">${escHtml(m.time)}</div>
          </div>
        `;
      } else {
        html += `
          <div class="st-chat-bubble-wrap received">
            <div class="st-chat-sender">${escHtml(m.sender)} → ${escHtml(m.receiver)}</div>
            <div class="st-chat-bubble received ${m.msgType}">
              ${renderMsgContent(m)}
            </div>
            <div class="st-chat-time">${escHtml(m.time)}</div>
          </div>
        `;
      }
    });

    el.innerHTML = html;
    // 等 DOM 完成布局后再滚动，否则 scrollHeight 是旧值
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
      });
    });
  }

  function renderMsgContent(m) {
    switch (m.msgType) {
      case "sticker":
        return `🐾 表情包: ${escHtml(m.content)}`;
      case "transfer":
        return `💰 <b>${escHtml(m.content)}</b>`;
      case "voice":
        return `🔊 ${escHtml(m.content)} <span style="font-size:10px;color:#999">▸ 3''</span>`;
      case "music":
        const parts = m.content.split("$");
        return `🎵 ${escHtml(parts[0])}${parts[1] ? " — " + escHtml(parts[1]) : ""}`;
      case "image":
        return `🖼️ ${escHtml(m.content)}`;
      default:
        return escHtml(m.content);
    }
  }

  function renderRednote() {
    const el = getContentEl();
    if (!el) return;

    if (STATE.rednotes.length === 0) {
      el.innerHTML = `
        <div class="st-phone-empty">
          <span class="empty-icon">📕</span>
          <span>暂无红书帖子</span>
        </div>
      `;
      return;
    }

    let html = "";
    STATE.rednotes.forEach((rn) => {
      html += `
        <div class="st-rednote-card">
          <div class="rn-header">
            <div class="rn-avatar" style="background:${avatarColor(rn.author)}">${avatarInitial(rn.author)}</div>
            <div>
              <div class="rn-author">${escHtml(rn.author)}</div>
              <div class="rn-time-rn">${escHtml(rn.time)}</div>
            </div>
          </div>
          <div class="rn-title1">${escHtml(rn.title1)}</div>
          <div class="rn-title2">${escHtml(rn.title2)}</div>
          <div class="rn-body">${escHtml(rn.content)}</div>
          <div class="rn-stats">
            <span>❤️ ${rn.likes}</span>
            <span>⭐ ${rn.collects}</span>
            <span>💬 ${rn.comments_count}</span>
          </div>
          ${rn.comments.length > 0 ? `
          <div class="rn-comments">
            ${rn.comments.map((c) => `
              <div class="rn-comment">
                <span class="rn-c-author">${escHtml(c.author)}</span>：${escHtml(c.content)}
                <span class="rn-c-likes">❤️ ${c.likes}</span>
              </div>
            `).join("")}
          </div>
          ` : ""}
        </div>
      `;
    });

    el.innerHTML = html;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
      });
    });
  }

  function renderContacts() {
    const el = getContentEl();
    if (!el) return;

    if (STATE.contacts.length === 0) {
      el.innerHTML = `
        <div class="st-phone-empty">
          <span class="empty-icon">👥</span>
          <span>暂无联系人</span>
        </div>
      `;
      return;
    }

    let html = "";
    STATE.contacts.forEach((c) => {
      html += `
        <div class="st-contact-item">
          <div class="st-contact-avatar" style="background:${avatarColor(c.name)}">
            ${avatarInitial(c.name)}
          </div>
          <div class="st-contact-info">
            <div class="st-contact-name">${escHtml(c.name)}</div>
            <div class="st-contact-last">${escHtml(c.lastMsg || "暂无消息")}</div>
          </div>
        </div>
      `;
    });

    el.innerHTML = html;
  }

  function switchTab(tab) {
    STATE.currentTab = tab;
    const container = document.getElementById("st-phone-container");
    if (container) {
      container.querySelectorAll(".st-phone-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.tab === tab);
      });
    }
    renderCurrentTab();
  }

  function updateBadge(count) {
    const btn = document.getElementById("st-phone-floating-btn");
    if (!btn) return;
    const badge = btn.querySelector(".badge");
    if (!badge) return;

    if (STATE.msgCount > 0) {
      btn.style.display = "flex";
      badge.style.display = "flex";
      badge.textContent = STATE.msgCount > 99 ? "99+" : STATE.msgCount;
    } else {
      badge.style.display = "none";
      if (!STATE.visible) {
        btn.style.display = "none";
      }
    }
  }

  // ============ 消息监听 ============
  function getMessageTextFromElement(el) {
    if (!el) return "";
    // 优先使用 textContent（已解码 HTML 实体）
    let text = el.textContent || el.innerText || "";
    // 如果 textContent 为空（罕见情况），尝试 innerHTML 并解码
    if (!text.trim() && el.innerHTML) {
      const div = document.createElement("div");
      div.innerHTML = el.innerHTML
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "");
      text = div.textContent || "";
    }
    return text;
  }

  function processMessageText(text) {
    if (!text) return;

    console.log("[ST-Phone-UI] 扫描文本（长度" + text.length + "）:", text.substring(0, 300));

    const msgs = parseMessages(text);
    const notes = parseRednotes(text);

    if (msgs.length > 0) {
      console.log("[ST-Phone-UI] 添加 " + msgs.length + " 条聊天消息");
      STATE.messages.push(...msgs);
      STATE.msgCount += msgs.length;
      STATE.contacts = extractContacts(STATE.messages);
      updateBadge(STATE.msgCount);

      // 如果手机正在显示，实时更新
      if (STATE.visible && STATE.currentTab === "chat") {
        renderChat();
      }
    }

    if (notes.length > 0) {
      console.log("[ST-Phone-UI] 添加 " + notes.length + " 条红书帖子");
      // 合并帖子（相同 ID 的更新）
      notes.forEach((n) => {
        const existing = STATE.rednotes.findIndex((r) => r.id === n.id);
        if (existing >= 0) {
          STATE.rednotes[existing] = n;
        } else {
          STATE.rednotes.push(n);
        }
      });
      STATE.msgCount += notes.length;
      updateBadge(STATE.msgCount);

      if (STATE.visible && STATE.currentTab === "rednote") {
        renderRednote();
      }
    }
  }

  function scanExistingMessages() {
    // 扫描已有的消息，尝试多种可能的消息容器
    const selectors = [
      ".mes_text",
      ".mes_content",
      ".message-content",
      ".chat-message-body",
      ".message-text",
      ".msg-text",
      ".msg_body",
    ];

    let mesTexts = [];
    for (const sel of selectors) {
      mesTexts = document.querySelectorAll(sel);
      if (mesTexts.length > 0) {
        console.log("[ST-Phone-UI] 使用选择器 '" + sel + "' 扫描到 " + mesTexts.length + " 条消息");
        break;
      }
    }

    if (mesTexts.length === 0) {
      console.log("[ST-Phone-UI] 警告：未找到任何消息元素");
      return;
    }

    mesTexts.forEach((el) => {
      processMessageText(getMessageTextFromElement(el));
    });
  }

  function setupObserver() {
    if (STATE.observer) {
      STATE.observer.disconnect();
    }

    // 尝试多种可能的聊天容器选择器
    const chatSelectors = [
      "#chat",
      ".chat-content",
      "#chat-content",
      '[data-testid="chat"]',
      ".messages",
      "#chat-messages",
      "#chat-history",
      ".chat-history",
      ".chat-messages",
      "#chat-messages-container",
      ".chat-messages-container",
    ];

    let chatContainer = null;
    for (const sel of chatSelectors) {
      chatContainer = document.querySelector(sel);
      if (chatContainer) {
        console.log("[ST-Phone-UI] 找到聊天容器:", sel);
        break;
      }
    }

    if (!chatContainer) {
      // 回退：监听整个 body
      chatContainer = document.body;
      console.log("[ST-Phone-UI] 使用 document.body 作为聊天容器回退");
    }

    STATE.observer = new MutationObserver((mutations) => {
      let hasNewMessages = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查新增的节点中是否包含消息文本
            const mesTexts = node.querySelectorAll ? node.querySelectorAll(".mes_text") : [];
            mesTexts.forEach((el) => {
              processMessageText(getMessageTextFromElement(el));
              hasNewMessages = true;
            });

            // 也检查节点本身
            if (node.classList && node.classList.contains("mes_text")) {
              processMessageText(getMessageTextFromElement(node));
              hasNewMessages = true;
            }
          }
        });
      });

      // 如果有新消息且手机显示了，自动显示浮动按钮
      if (hasNewMessages && STATE.msgCount > 0) {
        const btn = document.getElementById("st-phone-floating-btn");
        if (btn) btn.style.display = "flex";
      }
    });

    STATE.observer.observe(chatContainer, {
      childList: true,
      subtree: true,
    });
  }

  // ============ 工具函数 ============
  function escHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ============ 初始化 ============
  function init() {
    if (STATE.initialized) return;

    console.log("[ST-Phone-UI] 开始初始化...");
    createPhoneUI();

    // 默认显示浮动按钮，让用户可以手动打开
    const btn = document.getElementById("st-phone-floating-btn");
    if (btn) {
      btn.style.display = "flex";
      btn.style.visibility = "visible";
      btn.style.opacity = "1";
      console.log("[ST-Phone-UI] 浮动按钮已创建并显示");
      
      // 调试：输出按钮位置
      setTimeout(() => {
        const rect = btn.getBoundingClientRect();
        console.log("[ST-Phone-UI] 按钮位置:", rect);
      }, 100);
    } else {
      console.error("[ST-Phone-UI] 错误：浮动按钮未创建成功！");
    }

    scanExistingMessages();
    setupObserver();

    // 如果已经有消息，确保按钮显示
    if (STATE.msgCount > 0) {
      if (btn) btn.style.display = "flex";
    }

    console.log("[ST-Phone-UI] 手机聊天UI扩展已就绪 — 请查看右下角是否有 📱 按钮");
  }

  // 等待 DOM 就绪后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // 再等一小会儿，确保 ST 的聊天界面已渲染
      setTimeout(init, 2000);
    });
  } else {
    setTimeout(init, 2000);
  }

  // 也监听 ST 的特定事件（如果可用）
  try {
    if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) {
      const context = SillyTavern.getContext();
      if (context && context.eventSource) {
        context.eventSource.on("message_received", () => {
          // 消息接收后重新扫描
          setTimeout(scanExistingMessages, 500);
        });
      }
    }
  } catch (e) {
    // ST 事件 API 不可用，使用 MutationObserver 作为回退
  }
})();
