// ==UserScript==
// @name         粉笔网页增强
// @namespace    https://spa.fenbi.com/
// @version      0.2.3
// @description  在粉笔网页版解析页恢复显示题友评论。
// @author       杭州第一深情
// @match        https://spa.fenbi.com/ti/*
// @connect      ke.fenbi.com
// @connect      tiku.fenbi.com
// @connect      tikuapi.fenbi.com
// @connect      urlimg.fenbi.com
// @connect      nodestatic.fbstatic.cn
// @connect      web.nofbcdn.cn
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ATTR = 'data-fcp-comments';
  const PAGE_SIZE = 30;
  const MAX_PAGES = 2;
  const questionIdMapCache = new Map();

  const styles = `
    .fcp-comments {
      display: block;
      margin-top: 20px;
      color: var(--text-color, #333);
      font-size: 14px;
    }
    .fcp-comments__heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 32px;
      margin-bottom: 10px;
      font-size: 18px;
      font-weight: 600;
    }
    .fcp-comments__action {
      border: 0;
      padding: 4px 10px;
      border-radius: 5px;
      background: #f2f4f7;
      color: #666;
      cursor: pointer;
      font-size: 13px;
    }
    .fcp-comments__action:hover { color: #ff5b5b; }
    .fcp-comments__status {
      padding: 12px 14px;
      border-radius: 6px;
      background: #f7f8fa;
      color: #8a8f99;
      line-height: 1.6;
    }
    .fcp-comments__list {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .fcp-comment {
      padding: 12px 14px;
      border: 1px solid rgba(144, 144, 144, .22);
      border-radius: 7px;
      background: rgba(255, 255, 255, .55);
    }
    .fcp-comment__text {
      margin: 0;
      color: inherit;
      line-height: 1.75;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .fcp-comment__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 7px;
      color: #999;
      font-size: 12px;
    }
    @media (prefers-color-scheme: dark) {
      .fcp-comments__action, .fcp-comments__status { background: rgba(255,255,255,.08); }
      .fcp-comment { background: rgba(255,255,255,.03); }
    }
  `;

  function installStyles() {
    if (document.getElementById('fcp-comments-style')) return;
    const style = document.createElement('style');
    style.id = 'fcp-comments-style';
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      const request = typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' ? GM.xmlHttpRequest : undefined);

      if (typeof request !== 'function') {
        reject(new Error('油猴未授予跨域请求权限，请确认脚本头部的 @grant 后重新安装脚本'));
        return;
      }

      request({
        method: 'GET',
        url,
        anonymous: false,
        withCredentials: true,
        timeout: 15000,
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: location.href,
        },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`请求失败（HTTP ${response.status}）`));
            return;
          }
          try {
            resolve(JSON.parse(response.responseText));
          } catch {
            reject(new Error('接口返回的不是有效 JSON'));
          }
        },
        ontimeout() { reject(new Error('请求超时')); },
        onerror() { reject(new Error('网络请求失败')); },
      });
    });
  }

  function currentExerciseParams() {
    const match = location.pathname.match(/^\/ti\/exam\/solution\/([^/]+)/);
    if (!match) return null;
    const query = new URLSearchParams(location.search);
    return {
      key: decodeURIComponent(match[1]),
      routecs: query.get('routecs') || 'xingce',
      examcatid: query.get('examcatid') || '',
    };
  }

  function normalizeAssetUrls(value) {
    const result = [];
    const seen = new Set();

    function visit(item) {
      if (!item) return;
      if (typeof item === 'string') {
        if (!/^(?:https?:)?\/\//.test(item) && !item.startsWith('/')) return;
        const url = item.startsWith('//') ? `${location.protocol}${item}` : new URL(item, location.href).href;
        if (!result.includes(url)) result.push(url);
        return;
      }
      if (typeof item !== 'object' || seen.has(item)) return;
      seen.add(item);
      if (Array.isArray(item)) {
        item.forEach(visit);
        return;
      }
      if ('urls' in item) visit(item.urls);
      if ('url' in item) visit(item.url);
      for (const [key, child] of Object.entries(item)) {
        if (key !== 'urls' && key !== 'url') visit(child);
      }
    }

    visit(value);
    return result;
  }

  function collectQuestionIds(value, result, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    if (!Array.isArray(value)) {
      const globalId = value.globalId ?? value.questionKey;
      const id = value.id ?? value.questionId;
      if (typeof globalId === 'string' && (typeof id === 'number' || /^\d+$/.test(String(id)))) {
        result.set(globalId, Number(id));
      }
    }

    for (const child of Object.values(value)) {
      collectQuestionIds(child, result, seen);
    }
  }

  async function loadQuestionIdMap() {
    const params = currentExerciseParams();
    if (!params) throw new Error('当前页面不是练习解析页');
    const cacheKey = `${params.routecs}:${params.key}:${params.examcatid}`;
    if (questionIdMapCache.has(cacheKey)) return questionIdMapCache.get(cacheKey);

    const loading = (async () => {
      const url = new URL('https://tiku.fenbi.com/combine/exercise/getSolution');
      url.searchParams.set('format', 'html');
      url.searchParams.set('key', params.key);
      url.searchParams.set('routecs', params.routecs);
      url.searchParams.set('kav', '125');
      url.searchParams.set('av', '127');
      url.searchParams.set('hav', '125');
      url.searchParams.set('app', 'web');
      url.searchParams.set('apcid', '0');
      url.searchParams.set('gav', '2');
      if (params.examcatid) url.searchParams.set('examcatid', params.examcatid);

      const deviceId = localStorage.getItem('deviceSid');
      if (deviceId) url.searchParams.set('deviceId', deviceId);

      const solutionPayload = await requestJson(url.href);
      const solution = solutionPayload?.data ?? solutionPayload;
      const staticUrls = normalizeAssetUrls(solution?.staticUrl);
      if (!staticUrls.length) throw new Error('练习解析数据中的 staticUrl 不包含可用资源地址');

      const staticPayloads = await Promise.all(staticUrls.map(requestJson));
      const result = new Map();
      for (const staticPayload of staticPayloads) {
        collectQuestionIds(staticPayload?.data ?? staticPayload, result);
      }
      if (!result.size) throw new Error('题目资源中没有可用的数字 ID');
      return result;
    })();

    questionIdMapCache.set(cacheKey, loading);
    try {
      return await loading;
    } catch (error) {
      questionIdMapCache.delete(cacheKey);
      throw error;
    }
  }

  async function resolveQuestionId(questionKey) {
    const questionIdMap = await loadQuestionIdMap();
    return questionIdMap.get(questionKey) ?? null;
  }

  function findEpisodeId(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const id = findEpisodeId(item, seen);
        if (id) return id;
      }
      return null;
    }

    if ((typeof value.id === 'number' || typeof value.id === 'string') && value.id) {
      return value.id;
    }

    for (const child of Object.values(value)) {
      const id = findEpisodeId(child, seen);
      if (id) return id;
    }
    return null;
  }

  async function getEpisodeId(questionId) {
    const url = new URL('https://ke.fenbi.com/api/gwy/v3/episodes/tiku_episodes_with_multi_type');
    url.searchParams.set('tiku_ids', String(questionId));
    url.searchParams.set('tiku_prefix', 'xingce');
    url.searchParams.set('tiku_type', '5');

    const payload = await requestJson(url.href);
    const questionEpisodes = payload?.data?.[questionId] ?? payload?.data?.[String(questionId)];
    return findEpisodeId(questionEpisodes);
  }

  async function getComments(episodeId) {
    const pages = Array.from({ length: MAX_PAGES }, (_, index) => index * PAGE_SIZE);
    const pageResults = await Promise.allSettled(pages.map((start) => {
      const url = new URL(`https://ke.fenbi.com/ipad/gwy/v3/comments/episodes/${episodeId}`);
      url.searchParams.set('system', '12.4.7');
      url.searchParams.set('inhouse', '0');
      url.searchParams.set('app', 'gwy');
      url.searchParams.set('ua', 'iPad');
      url.searchParams.set('av', '44');
      url.searchParams.set('version', '6.11.3');
      // 保留旧版 iPad 客户端的重复参数；scourgify 的兼容请求也使用此格式。
      url.searchParams.append('kav', '22');
      url.searchParams.append('kav', '1');
      url.searchParams.set('len', String(PAGE_SIZE));
      url.searchParams.set('start', String(start));
      return requestJson(url.href);
    }));

    const payloads = pageResults
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    if (!payloads.length) {
      throw pageResults[0]?.reason ?? new Error('评论请求失败');
    }

    const byId = new Map();
    for (const payload of payloads) {
      const comments = payload?.datas ?? payload?.data?.datas ?? payload?.data ?? [];
      if (!Array.isArray(comments)) continue;
      for (const comment of comments) {
        const key = comment.id ?? `${comment.createdTime ?? ''}:${comment.comment ?? ''}`;
        byId.set(key, comment);
      }
    }

    return [...byId.values()].sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
  }

  function formatTime(value) {
    if (!value) return '';
    const normalized = typeof value === 'number' && value < 1e12 ? value * 1000 : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false });
  }

  function renderComments(panel, comments) {
    const status = panel.querySelector('.fcp-comments__status');
    const list = panel.querySelector('.fcp-comments__list');
    const count = panel.querySelector('.fcp-comments__count');
    list.replaceChildren();
    count.textContent = comments.length ? `（${comments.length} 条）` : '';

    if (!comments.length) {
      status.hidden = false;
      status.textContent = '暂时没有获取到题友评论。';
      return;
    }

    status.hidden = true;
    for (const item of comments) {
      const row = document.createElement('li');
      row.className = 'fcp-comment';

      const text = document.createElement('p');
      text.className = 'fcp-comment__text';
      text.textContent = item.comment || item.content || '（空评论）';
      row.appendChild(text);

      const metaValues = [
        item.user?.nickname || item.userInfo?.nickname || item.nickname || '',
        Number.isFinite(item.likeCount) ? `赞 ${item.likeCount}` : '',
        item.fiveGradeScore ? `评分 ${item.fiveGradeScore}` : '',
        formatTime(item.createdTime),
      ].filter(Boolean);

      if (metaValues.length) {
        const meta = document.createElement('div');
        meta.className = 'fcp-comment__meta';
        for (const value of metaValues) {
          const span = document.createElement('span');
          span.textContent = value;
          meta.appendChild(span);
        }
        row.appendChild(meta);
      }
      list.appendChild(row);
    }
  }

  async function loadPanel(panel, questionKey) {
    if (panel.dataset.loading === 'true') return;
    panel.dataset.loading = 'true';
    const status = panel.querySelector('.fcp-comments__status');
    const retryButton = panel.querySelector('.fcp-comments__action');
    retryButton.hidden = true;
    status.hidden = false;
    status.textContent = '正在加载题友评论…';

    try {
      const questionId = await resolveQuestionId(questionKey);
      if (!questionId) throw new Error('练习数据中找不到当前题目的数字 ID');
      const episodeId = await getEpisodeId(questionId);
      if (!episodeId) throw new Error('该题暂未关联评论数据');
      renderComments(panel, await getComments(episodeId));
    } catch (error) {
      status.hidden = false;
      status.textContent = `评论加载失败：${error.message}`;
      retryButton.hidden = false;
    } finally {
      panel.dataset.loading = 'false';
    }
  }

  function createPanel(questionKey) {
    const panel = document.createElement('section');
    panel.className = 'fcp-comments';
    panel.setAttribute(PANEL_ATTR, questionKey);

    const heading = document.createElement('div');
    heading.className = 'fcp-comments__heading';
    const title = document.createElement('span');
    title.append('题友评论');
    const count = document.createElement('span');
    count.className = 'fcp-comments__count';
    title.appendChild(count);

    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'fcp-comments__action';
    retryButton.textContent = '重试';
    retryButton.hidden = true;
    retryButton.addEventListener('click', () => loadPanel(panel, questionKey));
    heading.append(title, retryButton);

    const status = document.createElement('div');
    status.className = 'fcp-comments__status';
    status.textContent = '正在加载题友评论…';
    const list = document.createElement('ol');
    list.className = 'fcp-comments__list';
    panel.append(heading, status, list);
    return panel;
  }

  function enhanceQuestions() {
    for (const question of document.querySelectorAll('app-ti[data-question-key]')) {
      const questionKey = question.getAttribute('data-question-key');
      if (!questionKey || question.querySelector(`[${PANEL_ATTR}]`)) continue;

      const panel = createPanel(questionKey);
      const noteSection = question.querySelector(`[id^="section-note-"]`);
      const anchor = noteSection || question.querySelector(`[id^="section-source-"]`) || question.lastElementChild;
      if (anchor) anchor.insertAdjacentElement('afterend', panel);
      else question.appendChild(panel);
      loadPanel(panel, questionKey);
    }
  }

  function start() {
    installStyles();
    enhanceQuestions();
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        enhanceQuestions();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
})();
