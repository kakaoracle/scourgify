'use strict';

// ---------------- 广告过滤订阅源 ----------------
// 每个源按顺序尝试镜像，第一个成功者生效；解析结果合并后存入 storage.local 供 content.js 使用。
const AD_SOURCES = [
  {
    name: 'easylist-china',
    urls: [
      'https://easylist-downloads.adblockplus.org/easylistchina.txt',
      'https://raw.githubusercontent.com/easylist/easylistchina/master/easylistchina.txt',
    ],
  },
  {
    name: 'adrules',
    urls: [
      'https://adrules.top/adblock.txt',
      'https://raw.githubusercontent.com/Cats-Team/AdRules/main/adblock.txt',
    ],
  },
];
const AD_REFRESH_ALARM = 'kakaoracle-adfilter-refresh';
const AD_REFRESH_PERIOD_MINUTES = 720;
const AD_DATA_KEY = 'adFilterData';
const AD_LIMITS = { globalSelectors: 40000, hostSelectors: 20000, hosts: 20000 };
// 选择器黑名单字符：防止订阅内容借 CSS 注入样式块或脚本语义。
const AD_SELECTOR_BAD = /[{};@<>\\]/;
// uBO 过程性选择器（:style() 等）在原生 CSS 里非法，会让整条规则失效，直接跳过。
const AD_SELECTOR_PROCEDURAL = /:(style|remove|has-text|matches-path|watch-attr|matches-attr|matches-css|upward|xpath)\(/i;
const AD_HOST_BAD = /[^a-z0-9._-]/i;

function parseAdblockList(text, source) {
  const globalSelectors = [];
  const hostSelectors = [];
  const exceptions = [];
  const hostSet = new Set();
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line[0] === '!' || line[0] === '[') continue;
    if (line[0] === '#' && line[1] !== '#') continue;
    // ||host^ 形式的网络规则：转成 iframe/embed 拦截域名后缀。
    if (line.startsWith('||')) {
      const match = line.match(/^\|\|([a-z0-9._-]+)\^?(?:\$|$)/i);
      if (match) {
        const host = match[1].replace(/\.+$/, '').toLowerCase();
        if (host && !hostSet.has(host)) hostSet.add(host);
      }
      continue;
    }
    if (line.startsWith('@@')) continue;
    const exceptionIndex = line.indexOf('#@#');
    if (exceptionIndex >= 0) {
      const selector = line.slice(exceptionIndex + 3).trim();
      if (selector && selector.length <= 400 && !AD_SELECTOR_BAD.test(selector) && !AD_SELECTOR_PROCEDURAL.test(selector)) exceptions.push(selector);
      continue;
    }
    const index = line.indexOf('##');
    if (index < 0) continue;
    const meta = line.slice(0, index);
    const selector = line.slice(index + 2).trim();
    if (!selector || selector.length > 400 || AD_SELECTOR_BAD.test(selector) || AD_SELECTOR_PROCEDURAL.test(selector)) continue;
    if (!meta) {
      if (globalSelectors.length < AD_LIMITS.globalSelectors) globalSelectors.push(selector);
      continue;
    }
    const domains = meta.split(',').map(item => item.replace(/^~/, '').replace(/\.+$/, '').trim().toLowerCase()).filter(Boolean);
    if (!domains.length || domains.some(domain => AD_HOST_BAD.test(domain))) continue;
    for (const domain of domains) {
      if (hostSelectors.length >= AD_LIMITS.hostSelectors) break;
      hostSelectors.push({ h: domain, s: selector });
    }
  }
  return { name: source, globalSelectors, hostSelectors, exceptions, hosts: [...hostSet] };
}

function fetchText(urls) {
  return urls.reduce((chain, url) => chain.catch(() => fetch(url, { method: 'GET' }).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  })), Promise.reject());
}

async function refreshAdFilterData() {
  const results = await Promise.allSettled(AD_SOURCES.map(source =>
    fetchText(source.urls).then(text => parseAdblockList(text, source.name))));
  const parsed = results.filter(item => item.status === 'fulfilled').map(item => item.value);
  if (!parsed.length) return { ok: false };
  const merged = {
    updatedAt: Date.now(),
    sources: parsed.map(item => item.name),
    selectors: [...new Set(parsed.flatMap(item => item.globalSelectors))],
    hostSelectors: parsed.flatMap(item => item.hostSelectors),
    exceptions: [...new Set(parsed.flatMap(item => item.exceptions))],
    hosts: [...new Set(parsed.flatMap(item => item.hosts))].slice(0, AD_LIMITS.hosts),
  };
  await chrome.storage.local.set({ [AD_DATA_KEY]: merged });
  return { ok: true, selectors: merged.selectors.length, hosts: merged.hosts.length };
}

function scheduleAdFilterRefresh() {
  chrome.alarms.get(AD_REFRESH_ALARM, alarm => {
    if (!alarm) chrome.alarms.create(AD_REFRESH_ALARM, { periodInMinutes: AD_REFRESH_PERIOD_MINUTES });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleAdFilterRefresh();
  refreshAdFilterData();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAdFilterRefresh();
  chrome.storage.local.get({ [AD_DATA_KEY]: null }, stored => {
    const data = stored[AD_DATA_KEY];
    const stale = !data || Date.now() - (data.updatedAt || 0) > AD_REFRESH_PERIOD_MINUTES * 2 * 60000;
    if (stale) refreshAdFilterData();
  });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === AD_REFRESH_ALARM) refreshAdFilterData();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'FCP_FETCH_JSON' || typeof message.url !== 'string') return false;

  (async () => {
    try {
      const target = new URL(message.url);
      const allowedHosts = new Set(['tiku.fenbi.com','ke.fenbi.com','keapi.fenbi.com']);
      if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname)) {
        sendResponse({ ok: false, error: '不允许请求该接口地址' });
        return;
      }
      const response = await fetch(message.url, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json, text/plain, */*' },
      });
      const text = await response.text();
      if (!response.ok) {
        sendResponse({ ok: false, error: `后台 HTTP ${response.status}（${target.hostname}${target.pathname}）` });
        return;
      }
      try {
        sendResponse({ ok: true, data: JSON.parse(text) });
      } catch {
        sendResponse({ ok: false, error: '接口返回的不是有效 JSON' });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || '网络请求失败' });
    }
  })();

  return true;
});
