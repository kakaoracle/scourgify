'use strict';
/*
 * 密码自动填充（通用）
 *
 * L1 修复层：把页面里会导致 Chrome 密码管理器「看不见 / 不肯填」的属性改回可识别形态
 *            —— autocomplete="off" / "new-password" / 随机值、表单级 autocomplete="off"、
 *               shadow DOM 内的表单、SPA 异步插入的字段。
 * L2 兜底层：Chrome 仍然不填时（跨站 iframe、自定义控件、未保存过的凭据），
 *            用扩展自己的本地凭据库直接写入，并通过原生 value setter + input/change
 *            事件兼容 React / Vue 受控组件。
 *
 * 安全说明：L2 凭据保存在 chrome.storage.local，未加密。默认关闭，只有用户手动开启本功能
 *          才会读写；页面面板内提供单条删除与保存后撤销，关闭开关即停止一切读写。
 */
(() => {
  const VAULT_KEY = 'kakaoraclePwdVault';
  const STYLE_ID = 'kakaoracle-pwd-fill-style';
  const BTN_FLAG = 'data-kakaoracle-pwd-btn';
  const PANEL_FLAG = 'data-kakaoracle-pwd-panel';
  const TOAST_FLAG = 'data-kakaoracle-pwd-toast';

  const BAD_TOKENS = new Set(['off', 'nope', 'none', 'false', '0', 'no', 'disabled', 'disable', 'never', 'random', 'do-not-autofill', 'new-password', 'newpassword']);
  const CODE_HINT = /code|otp|sms|captcha|verify|verification|动态|验证码|短信/i;
  const USER_HINT = /user|account|login|email|mail|phone|mobile|tel|name|uid|账号|用户名|手机|邮箱|用户/i;
  const USER_DENY = /pass|pwd|secret|captcha|code|verify|otp|sms|search|keyword|confirm|token/i;
  const PWD_HINT = /pass|pwd|secret|passwd|password|mima|密码/i;
  const NEW_PWD_HINT = /new|confirm|repeat|re-?enter|again|retype|新|确认|重复/i;
  const LOGIN_TEXT = /登录|登陆|登入|提交|确定|确认|下一步|继续|sign\s*in|log\s*in|submit|continue|next/i;

  let enabled = false;
  let vault = {};
  let observer = null;
  let rafId = 0;
  let uid = 0;
  let button = null;
  let panel = null;
  let hideTimer = 0;
  const pendingNodes = new Set();

  /* ---------------------------------- 工具 --------------------------------- */

  function attrs(el) {
    return [el.id, el.getAttribute('name'), el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('autocomplete')]
      .filter(Boolean).join(' ');
  }

  function isPasswordInput(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    const type = (el.type || 'text').toLowerCase();
    if (type === 'password') return true;
    if (type !== 'text' && type !== '') return false;
    const text = attrs(el);
    return PWD_HINT.test(text) && !CODE_HINT.test(text);
  }

  function isUsernameInput(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    if (isPasswordInput(el)) return false;
    const type = (el.type || 'text').toLowerCase();
    if (!['text', 'email', 'tel', ''].includes(type)) return false;
    const text = attrs(el);
    if (USER_DENY.test(text)) return false;
    return USER_HINT.test(text);
  }

  let observedRoots = new WeakSet();

  // 遍历子树并穿透 shadow DOM，返回其中的 input / form。
  function collectFields(root, out = []) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 11 && root.nodeType !== 9)) return out;
    if (root.matches?.('input,form')) out.push(root);
    for (const node of root.querySelectorAll?.('input,form') || []) out.push(node);
    for (const node of root.querySelectorAll?.('*') || []) {
      if (!node.shadowRoot) continue;
      observeRoot(node.shadowRoot);
      collectFields(node.shadowRoot, out);
    }
    return out;
  }

  function allPasswordFields() {
    return collectFields(document.body).filter(isPasswordInput);
  }

  /* ------------------------------- L1 修复层 -------------------------------- */

  // 计算「应该」写进去的 autocomplete 值；返回 null 表示不干预。
  function desiredToken(el, raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (el.tagName === 'FORM') {
      if (!value || !BAD_TOKENS.has(value)) return null;
      const hasPwd = collectFields(el).some(isPasswordInput);
      return hasPwd || !el.querySelector('input') ? 'on' : null;
    }
    if (el.tagName !== 'INPUT') return null;
    const text = attrs(el);
    if (CODE_HINT.test(text)) return null;                                  // 短信/图形验证码：一律不碰
    if (value && value !== 'on' && !BAD_TOKENS.has(value)) return null;     // 站点已有合法提示，尊重原值
    if (isPasswordInput(el)) return NEW_PWD_HINT.test(text) ? 'new-password' : 'current-password';
    if (isUsernameInput(el)) return 'username';
    return null;                                                            // 其他输入框不擅自打开，避免误填通讯录/支付信息
  }

  function repairInput(el) {
    if (el.disabled) return;
    const want = desiredToken(el, el.getAttribute('autocomplete'));
    if (want && el.getAttribute('autocomplete') !== want) el.setAttribute('autocomplete', want);
    // Chrome 的表单解析器依赖 name/id 做启发式判断；无 name 时用带前缀的 id 兜底（不影响提交数据）。
    if (el.type === 'password' && !el.getAttribute('name') && !el.id) {
      el.setAttribute('id', `kakaoracle-pwd-field-${++uid}`);
    }
  }

  function repairForm(form) {
    const hasPwd = collectFields(form).some(isPasswordInput);
    if (!hasPwd) return;
    const raw = (form.getAttribute('autocomplete') || '').toLowerCase();
    if (!raw || BAD_TOKENS.has(raw)) form.setAttribute('autocomplete', 'on');
  }

  function repairTree(node) {
    for (const el of collectFields(node)) {
      if (el.tagName === 'INPUT') repairInput(el);
      else repairForm(el);
    }
  }

  function scheduleRepair(node) {
    if (node) pendingNodes.add(node);
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const nodes = [...pendingNodes];
      pendingNodes.clear();
      for (const item of nodes) repairTree(item);
    });
  }

  // 拦住「站点后续再把 autocomplete 改回 off」的 IDL 属性路径。
  // autocomplete 的宿主原型在不同引擎里不同（Chrome 在 HTMLElement，jsdom 在 HTMLInputElement），
  // 因此沿原型链找到真正持有描述符的那一层再改写，并覆盖三个可能各自声明的宿主。
  function hardenAutocompleteProperty(ctor) {
    if (!ctor) return;
    let proto = ctor.prototype;
    while (proto && !Object.getOwnPropertyDescriptor(proto, 'autocomplete')) proto = Object.getPrototypeOf(proto);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, 'autocomplete');
    if (!desc?.set) return;
    Object.defineProperty(proto, 'autocomplete', {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get.call(this); },
      set(value) {
        if (enabled) {
          const want = desiredToken(this, value);
          if (want) { desc.set.call(this, want); return; }
        }
        desc.set.call(this, value);
      },
    });
  }

  // 拦住「站点后续再把 autocomplete 改回 off」的两条路径：IDL 属性与 setAttribute。
  function hardenAutocomplete() {
    const nativeSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (String(name).toLowerCase() === 'autocomplete' && enabled) {
        const want = desiredToken(this, value);
        if (want) return nativeSetAttribute.call(this, name, want);
      }
      return nativeSetAttribute.call(this, name, value);
    };

    hardenAutocompleteProperty(HTMLElement);
    hardenAutocompleteProperty(HTMLInputElement);
    hardenAutocompleteProperty(HTMLFormElement);

    // shadow DOM 内部的变化不会冒泡到 document 的 MutationObserver，
    // 因此拦下 attachShadow 并单独观察每个影子根。
    if (!Element.prototype.__kakaoracleAttachShadow) {
      const nativeAttachShadow = Element.prototype.attachShadow;
      const patched = function (...args) {
        const root = nativeAttachShadow.apply(this, args);
        if (enabled) { observeRoot(root); scheduleRepair(root); }
        return root;
      };
      patched.__kakaoracleAttachShadow = true;
      Element.prototype.attachShadow = patched;
    }
  }

  /* ------------------------------- L2 兜底层 -------------------------------- */

  function credentials() {
    return Array.isArray(vault[location.origin]) ? vault[location.origin] : [];
  }

  // 原生 value setter + 事件派发，兼容 React / Vue 的受控组件。
  function setValue(el, value) {
    if (!el) return;
    el.focus?.();
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
  }

  function usernameFieldFor(pwd) {
    const fields = collectFields(document.body).filter(isUsernameInput);
    let best = null;
    for (const el of fields) {
      if (el === pwd) continue;
      if (pwd.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) best = el;
    }
    return best;
  }

  function fill(pwd, cred) {
    const user = cred.username ? usernameFieldFor(pwd) : null;
    if (user && !user.value) setValue(user, cred.username);
    setValue(pwd, cred.password);
    closePanel();
  }

  async function persist(username, password) {
    if (!enabled || !password) return;
    const origin = location.origin;
    const list = vault[origin] ? [...vault[origin]] : [];
    const index = list.findIndex(item => item.username === username);
    const record = { username: username || '', password, updatedAt: Date.now() };
    if (index >= 0) {
      if (list[index].password === password) list[index] = record;
      else { list.splice(index, 1); list.unshift(record); }
    } else list.unshift(record);
    vault[origin] = list.slice(0, 10);
    await chrome.storage.local.set({ [VAULT_KEY]: vault });
    toast(`已保存登录信息${username ? `：${username}` : ''}`, [{ label: '撤销', run: () => removeCredential(username, password) }]);
  }

  async function removeCredential(username, password) {
    const origin = location.origin;
    const list = (vault[origin] || []).filter(item => !(item.username === username && item.password === password));
    vault[origin] = list;
    await chrome.storage.local.set({ [VAULT_KEY]: vault });
    toast('已删除该条记录');
  }

  async function clearOrigin() {
    delete vault[location.origin];
    await chrome.storage.local.set({ [VAULT_KEY]: vault });
    closePanel();
    toast('已清空本站保存的登录信息');
  }

  function captureFromField(pwd) {
    if (!pwd || !pwd.value) return;
    const user = usernameFieldFor(pwd);
    persist(user?.value?.trim() || '', pwd.value);
  }

  /* ---------------------------------- UI ----------------------------------- */

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.kakaoracle-pwd-btn{position:fixed;z-index:2147483000;height:22px;padding:0 7px;font:12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2933;background:#fff;border:1px solid #cbd2d9;border-radius:6px;box-shadow:0 1px 4px rgba(15,23,42,.18);cursor:pointer}
.kakaoracle-pwd-btn:hover{background:#f5f7fa;border-color:#7b8794}
.kakaoracle-pwd-panel{position:fixed;z-index:2147483001;width:260px;max-height:280px;overflow:auto;background:#fff;border:1px solid #cbd2d9;border-radius:10px;box-shadow:0 8px 28px rgba(15,23,42,.22);padding:8px;font:13px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2933}
.kakaoracle-pwd-panel h4{margin:0 0 6px;font-size:12px;font-weight:500;color:#7b8794}
.kakaoracle-pwd-row{display:flex;align-items:center;gap:6px;padding:4px 0;border-top:1px solid #e4e7eb}
.${'kakaoracle'}-pwd-row:first-of-type{border-top:0}
.kakaoracle-pwd-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kakaoracle-pwd-panel button{font:12px/1 system-ui,sans-serif;padding:4px 8px;border:1px solid #cbd2d9;border-radius:6px;background:#fff;color:#1f2933;cursor:pointer}
.kakaoracle-pwd-panel button:hover{background:#f5f7fa}
.kakaoracle-pwd-foot{display:flex;gap:6px;margin-top:8px;border-top:1px solid #e4e7eb;padding-top:8px}
.kakaoracle-pwd-empty{padding:6px 0;color:#7b8794}
.kakaoracle-pwd-toast{position:fixed;right:16px;bottom:16px;z-index:2147483002;display:flex;align-items:center;gap:10px;background:#1f2933;color:#fff;font:13px/1.5 system-ui,sans-serif;padding:8px 12px;border-radius:8px;box-shadow:0 6px 20px rgba(15,23,42,.28)}
.kakaoracle-pwd-toast button{background:none;border:0;color:#85b7eb;font:13px/1 system-ui,sans-serif;cursor:pointer;padding:0}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function place(el, field, offsetY) {
    const rect = field.getBoundingClientRect();
    const width = el.offsetWidth || 60;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width - 6));
    const top = Math.max(8, Math.min(window.innerHeight - 30, rect.top + offsetY));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function showButton(field) {
    ensureStyle();
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'kakaoracle-pwd-btn';
      button.setAttribute(BTN_FLAG, '');
      button.textContent = '填充';
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => { button.__field && openPanel(button.__field); });
      document.body.appendChild(button);
    }
    button.__field = field;
    place(button, field, (field.getBoundingClientRect().height - 22) / 2);
    button.hidden = false;
    clearTimeout(hideTimer);
  }

  function hideButton(delay = 200) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (button && !panel) button.hidden = true; }, delay);
  }

  function closePanel() {
    panel?.remove();
    panel = null;
    hideButton(0);
  }

  function openPanel(field) {
    closePanel();
    ensureStyle();
    const list = credentials();
    panel = document.createElement('div');
    panel.className = 'kakaoracle-pwd-panel';
    panel.setAttribute(PANEL_FLAG, '');
    panel.addEventListener('mousedown', event => event.preventDefault());

    const title = document.createElement('h4');
    title.textContent = `${location.hostname} 的登录信息`;
    panel.appendChild(title);

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'kakaoracle-pwd-empty';
      empty.textContent = '尚未保存。输入账号密码后登录一次即可自动记录。';
      panel.appendChild(empty);
    }
    for (const cred of list) {
      const row = document.createElement('div');
      row.className = 'kakaoracle-pwd-row';
      const name = document.createElement('span');
      name.className = 'kakaoracle-pwd-name';
      name.textContent = cred.username || '(未记录账号)';
      name.title = name.textContent;
      const use = document.createElement('button');
      use.type = 'button';
      use.textContent = '填充';
      use.addEventListener('click', () => { fill(field, cred); toast('已填充'); });
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '删除';
      del.addEventListener('click', () => removeCredential(cred.username, cred.password).then(closePanel));
      row.append(name, use, del);
      panel.appendChild(row);
    }

    const foot = document.createElement('div');
    foot.className = 'kakaoracle-pwd-foot';
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '保存当前输入';
    save.addEventListener('click', () => captureFromField(field));
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = '清空本站';
    clear.addEventListener('click', clearOrigin);
    foot.append(save, clear);
    panel.appendChild(foot);

    document.body.appendChild(panel);
    place(panel, field, field.getBoundingClientRect().height + 6);
    panel.style.top = `${Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, parseFloat(panel.style.top) || 8))}px`;
  }

  function toast(text, actions = []) {
    if (!enabled) return;
    ensureStyle();
    document.querySelectorAll(`[${TOAST_FLAG}]`).forEach(node => node.remove());
    const box = document.createElement('div');
    box.className = 'kakaoracle-pwd-toast';
    box.setAttribute(TOAST_FLAG, '');
    box.appendChild(document.createTextNode(text));
    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { action.run?.(); box.remove(); });
      box.appendChild(btn);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4000);
  }

  /* ------------------------------- 自动填充触发 ------------------------------ */

  function maybeAutoFill(field) {
    if (!enabled || field.value) return;
    const list = credentials();
    if (list.length === 1) {
      fill(field, list[0]);
      toast(`已填充 ${list[0].username || '已保存账号'}`);
    }
  }

  function tryInitialFill() {
    if (!enabled) return;
    const field = allPasswordFields().find(item => !item.value);
    if (field) maybeAutoFill(field);
  }

  /* -------------------------------- 生命周期 -------------------------------- */

  function bindEvents() {
    document.addEventListener('focusin', event => {
      if (!enabled) return;
      const target = event.target instanceof Element ? event.target.closest('input') : null;
      if (!target || !isPasswordInput(target)) return;
      showButton(target);
      maybeAutoFill(target);
    }, true);

    document.addEventListener('focusout', () => hideButton(), true);

    document.addEventListener('pointerover', event => {
      if (!enabled || panel) return;
      const target = event.target instanceof Element ? event.target.closest('input') : null;
      if (target && isPasswordInput(target)) showButton(target);
    }, true);

    document.addEventListener('click', event => {
      if (!enabled) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(`[${PANEL_FLAG}],[${BTN_FLAG}]`)) return;
      closePanel();
    }, true);

    // 表单提交：捕获阶段读取，避免站点在提交回调里清空密码。
    document.addEventListener('submit', event => {
      const form = event.target;
      if (!enabled || !form) return;
      const pwd = collectFields(form).find(isPasswordInput);
      if (pwd) captureFromField(pwd);
    }, true);

    // 非表单登录按钮（XHR 登录）：点击后延迟读取。
    document.addEventListener('click', event => {
      if (!enabled || !(event.target instanceof Element)) return;
      const btn = event.target.closest('button,[role="button"],input[type="button"],input[type="submit"]');
      if (!btn) return;
      const text = `${btn.textContent || ''} ${btn.value || ''}`;
      if (btn.type !== 'submit' && !LOGIN_TEXT.test(text)) return;
      setTimeout(() => {
        const pwd = allPasswordFields().find(item => item.value);
        if (pwd) captureFromField(pwd);
      }, 400);
    }, true);

    // 密码框里按回车登录。
    document.addEventListener('keydown', event => {
      if (!enabled || event.key !== 'Enter') return;
      const target = event.target instanceof Element ? event.target.closest('input') : null;
      if (target && isPasswordInput(target)) {
        setTimeout(() => captureFromField(target), 400);
      }
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closePanel();
    }, true);

    window.addEventListener('scroll', () => {
      if (!enabled || !button || button.hidden) return;
      if (button.__field) place(button, button.__field, (button.__field.getBoundingClientRect().height - 22) / 2);
    }, true);
    window.addEventListener('resize', closePanel, true);
  }

  function observeRoot(root) {
    if (!root || !observer || observedRoots.has(root)) return;
    observedRoots.add(root);
    try {
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['autocomplete', 'type'] });
    } catch { /* 部分节点类型不支持观察，忽略 */ }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') { scheduleRepair(mutation.target); continue; }
        for (const node of mutation.addedNodes) scheduleRepair(node);
      }
    });
    // 直接观察 document：document_start 阶段 documentElement 可能尚未创建，且这样能一并覆盖后续替换。
    observeRoot(document);
  }

  function activate() {
    if (observer) return;
    ensureStyle();
    hardenAutocomplete();
    startObserver();
    repairTree(document.body || document.documentElement);
    bindEvents();
    setTimeout(tryInitialFill, 500);
    setTimeout(tryInitialFill, 1500);
  }

  function deactivate() {
    observer?.disconnect();
    observer = null;
    observedRoots = new WeakSet();
    pendingNodes.clear();
    button?.remove(); button = null;
    panel?.remove(); panel = null;
    document.querySelectorAll(`[${TOAST_FLAG}]`).forEach(node => node.remove());
  }

  async function refresh() {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get({ pwdFillEnabled: false }),
      chrome.storage.local.get({ [VAULT_KEY]: {} }),
    ]);
    vault = local[VAULT_KEY] || {};
    const next = Boolean(sync.pwdFillEnabled);
    if (next === enabled) return;
    enabled = next;
    if (enabled) activate(); else deactivate();
  }

  refresh();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.pwdFillEnabled) {
      enabled = Boolean(changes.pwdFillEnabled.newValue);
      if (enabled) activate(); else deactivate();
      return;
    }
    if (area === 'local' && changes[VAULT_KEY]) vault = changes[VAULT_KEY].newValue || {};
  });
})();
