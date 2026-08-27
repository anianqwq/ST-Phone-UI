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
    btn.title = "打开手机";
    btn.addEventListener("click", togglePhone);
    document.body.appendChild(btn);

    // 手机容器
    const container = document.createElement("div");
    container.id = "st-phone-container";
    container.innerHTML = `
      <div class="st-phone-frame">
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
  function parseMessages(text) {
    const results = [];

    // 解析 <msg>发送人|接收人|内容|时间</msg>
    const msgRegex = /<msg>([^<]+)<\/msg>/g;
    let match;
    while ((match = msgRegex.exec(text)) !== null) {
      const parts = match[1].split("|");
      if (parts.length >= 4) {
        const sender = parts[0].trim();
        const receiver = parts[1].trim();
        const content = parts[2].trim();
        const time = parts[3].trim();

        let type = "text";
        let displayContent = content;

        // 检测特殊消息类型
        if (content.startsWith("[bqb-")) {
          type = "sticker";
          const stickerName = content.replace("[bqb-", "").replace("]", "");
          displayContent = stickerName;
        } else if (content.startsWith("[zz-")) {
          type = "transfer";
          const amount = content.replace("[zz-", "").replace("元]", "");
          displayContent = "💰 转账 " + amount + " 元";
        } else if (content.startsWith("[yy-")) {
          type = "voice";
          const voiceContent = content.replace("[yy-", "").replace("]", "");
          displayContent = voiceContent;
        } else if (content.startsWith("[music-")) {
          type = "music";
          const musicInfo = content.replace("[music-", "").replace("]", "");
          displayContent = musicInfo;
        } else if (content.startsWith("[img-")) {
          type = "image";
          const imgDesc = content.replace("[img-", "").replace("]", "");
          displayContent = "📷 " + imgDesc;
        }

        const isGroup = receiver.startsWith("群:");

        results.push({
          type: "msg",
          msgType: type,
          sender,
          receiver,
          content: displayContent,
          rawContent: content,
          time,
          isGroup,
          groupId: isGroup ? receiver.replace("群:", "") : null,
        });
      }
    }

    return results;
  }

  function parseRednotes(text) {
    const results = [];

    // 解析帖子 <rednote>...</rednote>
    const noteRegex = /<rednote>([^<]+)<\/rednote>/g;
    let match;
    while ((match = noteRegex.exec(text)) !== null) {
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
    el.scrollTop = el.scrollHeight;
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
    el.scrollTop = el.scrollHeight;
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
  function processMessageText(text) {
    if (!text) return;

    const msgs = parseMessages(text);
    const notes = parseRednotes(text);

    if (msgs.length > 0) {
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
    // 扫描已有的消息
    const mesTexts = document.querySelectorAll(".mes_text");
    mesTexts.forEach((el) => {
      processMessageText(el.textContent || el.innerText);
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
    ];

    let chatContainer = null;
    for (const sel of chatSelectors) {
      chatContainer = document.querySelector(sel);
      if (chatContainer) break;
    }

    if (!chatContainer) {
      // 回退：监听整个 body 中新增的 .mes_text
      chatContainer = document.body;
    }

    STATE.observer = new MutationObserver((mutations) => {
      let hasNewMessages = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查新增的节点中是否包含消息文本
            const mesTexts = node.querySelectorAll ? node.querySelectorAll(".mes_text") : [];
            mesTexts.forEach((el) => {
              processMessageText(el.textContent || el.innerText);
              hasNewMessages = true;
            });

            // 也检查节点本身
            if (node.classList && node.classList.contains("mes_text")) {
              processMessageText(node.textContent || node.innerText);
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

    createPhoneUI();
    scanExistingMessages();
    setupObserver();

    // 如果已经有消息，显示按钮
    if (STATE.msgCount > 0) {
      const btn = document.getElementById("st-phone-floating-btn");
      if (btn) btn.style.display = "flex";
    }

    console.log("[ST-Phone-UI] 手机聊天UI扩展已就绪");
  }

  // 注册扩展
const extension = {
    name: "ST-Phone-UI",
    init: init,
};
if (typeof registerExtension === "function") {
    registerExtension(extension);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
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
