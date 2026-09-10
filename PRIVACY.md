# 扫地僧 · 隐私政策

> 本扩展仓库：`https://github.com/kakaoracle/scourgify`
> 最后更新：2026-09-10

## 1. 概述

扫地僧（以下简称「本扩展」）是一款浏览器扩展（Manifest V3），不收集、不上传、不出售任何用户个人数据。本文档说明本扩展在何种情况下会接触用户数据、这些数据存放在哪里，以及用户如何控制或删除它们。

## 2. 数据存放原则

| 数据类型 | 存放位置 | 是否联网 | 默认开关 |
|:--|:--|:--|:--|
| 各项功能开关、组折叠状态、UI 偏好 | `chrome.storage.sync` | 仅用于跨设备同步用户自身已登录 Chrome 同步链路的设置 | 全部默认开启（除钥匙串） |
| 广告过滤规则缓存 | `chrome.storage.local` | 由 background 定期从公开订阅源拉取后落地 | 默认开启，可在 popup 关闭 |
| 个性化站点覆盖规则 | `chrome.storage.sync` | 随用户设置同步 | 默认空 |
| **钥匙串**保存的账号密码 | `chrome.storage.local` | **永不联网** | **默认关闭**，需用户在 popup 手动开启 |

> 本扩展不维护任何自有服务器，不向任何自有端点发送数据。

## 3. 主动发起的网络请求

| 场景 | 请求目标 | 触发条件 | 关闭方式 |
|:--|:--|:--|:--|
| 订阅广告过滤规则 | `https://easylist-downloads.adblockplus.org/` 与镜像 `https://raw.githubusercontent.com/easylist/easylistchina/` | 安装 / 浏览器启动 / 每 12 小时 | popup「广告过滤」开关 |
| 订阅广告过滤规则 | `https://adrules.top/` 与镜像 `https://raw.githubusercontent.com/Cats-Team/AdRules/` | 同上 | 同上 |
| 粉笔「AI 刷题班」跨域取数 | `https://tiku.fenbi.com/`、`https://ke.fenbi.com/`、`https://keapi.fenbi.com/` | 用户在粉笔页面使用「AI 刷题班优化」开关时 | popup「AI 刷题班优化」开关 |

> 这些请求走的是 HTTPS，请求中**不携带**任何本扩展用户身份信息，第三方（订阅源 / 粉笔）只能看到浏览器 IP 与 UA。

## 4. 钥匙串（密码自动填充）专项说明

- 钥匙串的账号、密码**仅存放在用户本机的 `chrome.storage.local`**，**未加密**。
- 本扩展不会将上述凭据发送到任何远端。
- 首次登录后由用户在原页面触发「记住」逻辑后写入；用户可在 popup「钥匙串」中点选、删除、清空。
- 关闭「钥匙串」开关后，本扩展立即停止读写该区域，并在页面卸载时清理已注入的 UI。
- 因属明文本地存储，**不建议在公用电脑或不受信任的设备上启用**。

## 5. 不会做的事

- 不收集浏览历史、Cookie、表单提交内容、广告点击行为
- 不使用任何分析、统计、追踪、远程上报 SDK
- 不在后台静默打开标签页、下载文件、执行远端脚本
- 不读取任何与本扩展功能无关的页面内容

## 6. 权限说明

- `storage`：读写上述本地数据
- `alarms`：周期性触发订阅源刷新
- `host_permissions`：见上表「主动发起的网络请求」的目标域
- `content_scripts` 匹配 `http(s)://*/*`：覆盖广告过滤（DOM 注入隐藏样式）与钥匙串（autocomplete 修复与凭据兜底填充），二者在所有页面运行；钥匙串默认关闭不会注入凭据相关 UI

## 7. 清除本扩展数据

- 卸载本扩展时，浏览器会自动清空 `chrome.storage.sync` 与 `chrome.storage.local` 中由本扩展写入的键
- 保留扩展但清除数据：在 `edge://extensions` 打开「扫地僧」→「扩展程序选项」或在 popup 中「钥匙串 → 清空」即可

## 8. 政策变更

若本扩展新增涉及用户数据的功能，会先更新本文档并在 Edge 商店提交新版本。重大变更会在仓库 README 顶部提示。

## 9. 联系方式

- 仓库 Issue：`https://github.com/kakaoracle/scourgify/issues`
- 邮箱：见 `https://github.com/kakaoracle` 个人页
