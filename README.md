<div align="center">

# ✦ 小 扫 帚 结 界 ✦

<img src="https://readme-typing-svg.demolab.com?font=M+PLUS+1p:wght@700&size=26&pause=1200&color=C7B9FF&center=true&vCenter=true&width=560&lines=%E6%8A%8A%E8%AF%84%E8%AE%BA%E8%AF%B7%E5%9B%9E%E6%9D%A5%EF%BC%8C%E6%8A%8A%E5%96%A7%E5%9A%A3%E8%AF%B7%E5%87%BA%E5%8E%BB;%E4%BA%8E%E9%A1%B5%E9%9D%A2%E7%9A%84%E8%A4%B6%E7%9A%B1%E9%87%8C%E6%82%84%E6%BD%9C%E6%96%BD%E9%AD%94%E6%B3%95;+%E7%81%B0%E5%A7%91%E5%A8%98%E4%B8%8D%E6%89%AB%E7%9A%84%E7%81%B0%E5%9F%83+%E7%94%B1%E6%88%91%E4%BB%AC%E6%9D%A5%E6%89%AB;+%E6%AD%A4%E7%BB%93%E7%95%8C%E5%B8%B8%E5%B9%B4%E8%90%A5%E4%B8%9A+%E6%AC%A2%E8%BF%8E%E5%85%89%E4%B8%B6+" alt="typing" />

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:B8A7E8,50:9FD8F5,100:D4F0C0&height=120&section=header&text=scourgify&fontSize=34&fontColor=ffffff&animation=fadeIn&fontAlignY=65" alt="banner" width="100%" />

![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/%E5%92%92%E6%96%87-JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![MIT](https://img.shields.io/badge/MIT-%E7%BB%93%E7%95%8C%E8%AE%B8%E5%8F%AF-FF6B6B?style=for-the-badge)
![Status](https://img.shields.io/badge/%E8%90%A5%E4%B8%9A%E4%B8%AD-blueviolet?style=for-the-badge)

> *「 灰尘不会自己离开，所以要有人挥动小扫帚。 」*

</div>

---

## ⛩ 此地为何处

传说每个网页的背后，都住着一群吵闹的小妖精：
它们把留言搬走、把广告堆成山、把正文挤到墙角罚站。

这里住着一位**扫除系魔女**。
她不写长篇大论的说明书，只在夜深人静时挥一挥扫帚 ——
第二天醒来，页面就变回了它本来该有的样子。

她随身还带一颗水晶球，专门收留迷路的乱码星尘。

---

## ✧ 结界一览

| 结界 | 目击者证词 | 状态 |
|:---:|:---|:---:|
| 🌸 **粉笔小径** | 被藏起来的留言，在解析与背题小径都会排队回家 | 营业中 |
| 🧠 **AI 刷题班优化** | 隐藏数字人；学习规划提供周次切换、学习分区、任务时长分布、真实任务组、可交互能力雷达图与阶段路径，排行榜复用官方 H5 | 可选 |
| 🔵 **蔚蓝书房** | 书页两侧的杂音被轻轻合上，正文终于坐上主位 | 安定 |
| 🧹 **扫尘走廊** | 通用广告源（EasyList China / AdRules）定时来投喂名单，个别不听话的站点由个性化路由表逐门逐户点名，广告被请到了门外 | 新开幕 |
| 💙 **蓝湖秘境** | 故事会照常举行，推销员被请到了门外 | 浅眠 |
| 🔮 **水晶小屋** | 散落一地的乱码星尘，乖乖排成了整齐的形状 | 值日中 |
| 🔑 **钥匙串** | 有些门被刻了「不许记住」的符文，扫帚替你把它抹平 | 可选 |

> ⚠️ 以上均为深夜目击证词，与实际功能的出入约等于一片樱花瓣的厚度。

---

## 🔑 钥匙串 · 密码自动填充

有些网站因为这样那样的原因，Chrome 死活不肯把密码填进去。钥匙串按两层处理：

**第一层 · 解开符文**（不保存任何东西，只是让 Chrome 恢复工作）

| 症状 | 处理 |
|:---|:---|
| `autocomplete="off"` / `new-password` / `nope` / 随机值 | 改写成 `current-password` / `username` / `on` |
| 表单级 `<form autocomplete="off">` | 表单级改回 `on` |
| 字段没有 `name` / `id`，Chrome 认不出哪个是账号框 | 补 `id` 与 `autocomplete` 提示 |
| 登录框藏在 shadow DOM 里 | 递归穿透影子根，并单独监听 |
| 登录框在 iframe 里 | 内容脚本以 `all_frames` 注入每个框架 |
| SPA 异步插入字段 | MutationObserver 持续修复 |
| 站点事后又把 `autocomplete` 改回 `off` | 拦住 `setAttribute` 与 IDL 属性两条回填路径 |

**第二层 · 亲自开门**（Chrome 仍然不填时的兜底）

- 首次登录后自动记录该站点的账号密码，下次聚焦密码框即自动填充；
- 多个账号时，密码框右侧出现「填充」按钮，点开可选择、删除、清空；
- 写入走原生 `value` setter 并派发 `input` / `change` 事件，React、Vue 的受控组件也能吃到；
- 短信验证码、图形验证码字段一律不碰。

> 🔒 钥匙串的凭据保存在 `chrome.storage.local`，**未加密**，且默认关闭。
> 只在你在「通用 → 密码自动填充」手动开启后才会读写；关掉开关即停止一切读写并清空页面残留 UI。
> 不建议在公用设备上开启。

完整数据使用与远程请求说明见 [PRIVACY.md](./PRIVACY.md)。

---

## 🧪 构成素材

<div align="center">

<a href="https://skillicons.dev">
  <img src="https://skillicons.dev/icons?i=js,html,css&theme=dark" />
</a>

<br/>

*三枚小小的咒文石，加上浏览器本尊的祝福。*

</div>

---

## 📡 结界能量读数

<div align="center">

<a href="https://github.com/kakaoracle/scourgify">
  <img src="https://github-readme-stats.vercel.app/api/pin/?username=kakaoracle&repo=scourgify&theme=tokyonight&hide_border=true" />
</a>
<br/>
<img src="https://streak-stats.demolab.com?user=kakaoracle&theme=tokyonight&hide_border=true&locale=zh_Hans" height="165" />

</div>

---

## 🕯️ 召唤仪式

<details>
<summary><b>点此展开（需要一点点勇气）</b></summary>

```text
1. 在地址栏轻声念出：chrome://extensions/
2. 唤醒沉睡的「开发者模式」
3. 点击「加载已解压的扩展程序」，指向本结界的门牌
4. 回到任一网页刷新 —— 魔法开始渗透
```

油猴旅人可携带 `scourgify.user.js` 单独出发。

*温柔提醒：扫帚只借用你已打开的门，从不偷配钥匙（复用现有登录会话，不读取、不保存任何 Cookie）。*

</details>

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:D4F0C0,50:9FD8F5,100:B8A7E8&height=100&section=footer" alt="footer" width="100%" />

*如果这把小扫帚曾替你扫亮过一块屏幕，*
*请点亮一颗 ⭐ 为魔女的水晶充能。*

`© 2026 小扫帚结界管理室 · 本结界谢绝灰尘入内`

</div>
