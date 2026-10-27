# 商城收录申请文案

提交地址：

https://github.com/polang233/dsh-plugin-index/issues/new?template=plugin-add.yml

标题：

```text
[plugin-add] dsh-fanqie-reader
```

## 插件地址

```text
https://www.npmjs.com/package/dsh-fanqie-reader
```

源码仓库：

```text
https://github.com/slp114514/dsh-fanqie-reader
```

如果 npm 发布暂时被账号 2FA 卡住，可以先按固定 Git 提交申请收录：

```text
仓库：https://github.com/slp114514/dsh-fanqie-reader
提交：d9920423ea1a4ef9c4d5242f89dc5ae86fb54cd2
子目录：无（插件在仓库根目录）
```

## 简短说明

中文：

```text
番茄小说左侧栏阅读器：在指定 DSH 会话里与 DeepSeek 共读；可选的高级互动桥使用本机 BlueStacks 登录态发书评/回复，默认按 DeepSeek 谷时运行。
```

English:

```text
A Fanqie novel reader in the DSH sidebar, scoped to one chosen session. An optional Windows/BlueStacks bridge can post reviews and replies with the user's own app account, scheduled by default during DeepSeek's off-peak window.
```

## 补充信息

```text
- Public repository + MIT license.
- Core reading, shelf, session scoping, and AI discussion work without BlueStacks.
- Optional advanced interaction bridge is Windows-only, requires an existing BlueStacks instance and one administrator authorization during BlueStacks installation; the plugin itself does not install software silently.
- The bridge starts BlueStacks on an invisible Windows desktop so the user does not see the player or free-tier promo windows; it does not change host security settings.
- Credentials stay local in $DSH_HOME/fanqie-reader/device-auth.json and are not included in the npm package.
- Tested on DSH 0.2.1-rc.3 / Windows 11: hidden start/stop, ADB, screenshots, schedule auto-start/stop, and adjustable interaction limits.
- The advanced bridge is optional; the package remains usable without it. A one-click BlueStacks installer is not included yet.
```

## 提交前检查

- [ ] `npm view dsh-fanqie-reader version` 能看到版本
- [ ] `npm pack --dry-run` 不包含 `device-auth.json` / `state.json` / Cookie
- [ ] GitHub 仓库是 Public，README、LICENSE、NOTICE、icon 都在
- [ ] 干净 DSH profile 安装过 npm 包
