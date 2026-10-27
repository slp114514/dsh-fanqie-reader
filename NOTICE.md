# NOTICE

本插件包含或改编了以下 MIT 许可的第三方内容：

## 1. 番茄动态字体 PUA 映射表

- 文件：`fanqie-font.js`
- 来源：**TomatoReader** — https://github.com/yu-jianbilibili/tomatoreader
- 版权：Copyright (c) 2026 Mews <saucepre@gmail.com>
- 许可：MIT
- 用途：把番茄正文中的 Unicode 私有区码位还原为汉字。本插件只做了格式转换（原项目的 TypeScript 打包产物 -> 独立映射模块）。

## 2. 浏览器路由信任围栏

- 文件：`trust.js`
- 来源：**dsh-bili-mini** — https://github.com/tuanzhanghao/dsh-bili-mini
- 版权：Copyright (c) 2026 tuanzhanghao
- 许可：MIT
- 说明：`trust.js` 的 Host / Origin / Sec-Fetch-Site 判断改编自 dsh-bili-mini 的同名文件；后者又改编自 `@tivility/dsh-web-kit` 与 DSH harness 的 `isTrustedApiRequest`。

## 3. 设计参考

- **dsh-bili-scroll** — https://github.com/c1overzz/dsh-bili-scroll
  - 参考了「在侧栏/设置中提供阅读入口 + 让模型读取真实内容 + 会话/任务隔离」的产品思路。本插件没有复制其代码。
- **dsh-bili-mini** — 左侧栏 `sidebar.panellist` + keyed `main` 面板的注册方式参考了该插件的公开源码。

以上第三方内容的完整 MIT 许可文本见各自仓库的 LICENSE。
