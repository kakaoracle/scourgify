'use strict';

// 个性化广告过滤路由表。
//
// content.js 的广告过滤分三层生效：
//   1. 内置基础规则（content.js 中 AD_BASE_SELECTORS / AD_BASE_HOSTS，最保守的通用签名）；
//   2. 订阅源（background.js 定期拉取 EasyList China + AdRules，覆盖绝大多数站点）；
//   3. 本路由表：当某个站点通用规则效果不好时，在这里按站点精修。
//
// 路由条目字段（全部可选）：
//   match          匹配的主机名后缀数组，如 ['222372.xyz']（含子域）；
//   note           给维护者看的说明；
//   selectors      追加的 CSS 隐藏选择器；
//   blockHosts     追加的广告域名后缀，命中后页面上对应的 iframe/embed 会被移除；
//   whitelist      需要豁免的选择器（与订阅/基础规则的选择器完全相同才生效）；
//   subscription   设为 false 时该站点跳过订阅源与基础规则，只用本条路由的选择器，
//                  用于订阅规则误伤页面时整体接管；
//   enabled        设为 false 时该站点完全关闭广告过滤。
// 运行期临时调整可写 chrome.storage.sync 的 adFilterSiteOverrides（键为主机名后缀，
// 字段同上），会与本路由表同名站点的条目合并且优先生效，无需改代码。

self.KAKAORACLE_AD_ROUTES = [
  {
    match: ['222372.xyz'],
    note: '示例路由：该站从开发机直连超时，无法核对真实 DOM。以下按苹果CMS/MacCMS 系影视站的常见广告位写的基础条目，订阅源已覆盖大部分；打开站点后若仍有漏网广告，把对应元素（右键-检查）发来即可精修此条目。',
    selectors: [
      // 模板内置广告位：中文站常以 gg（广告拼音首字母）、ad、adv 命名。
      '.gg', '.gg-box', '.ggbox', '.gg_link', '.gg_1', '.gg_2',
      '.ad_box', '.ad-wrap', '.ad_wrap', '.ads_box', '.adv_box', '.advert', '.adver',
      // 浮动与弹窗广告。
      '[id^="hm_"][id$="x100"]', '[id^="float_"]', '.float-ad', '.pop-ad',
      // 点击跳转的广告链接（模板里通常是 /ads/、/ad. 开头的跳转路径）。
      'a[href^="/ads/"]', 'a[href*="/adclick"]', 'a[href*="?ad="]',
    ],
    blockHosts: [],
    whitelist: [],
  },
];
