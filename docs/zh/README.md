# Cherry Studio 补丁更新说明

[English](../../README.md) | [中文](README.md)

本 README 仅保留本次补丁系列新增的功能。

## 界面预览

![补丁界面预览](../../imgs/patch-ui-showcase.png)

## 核心功能更新

1. 透明且持久化的多标签 UI
- 多标签栏为完全透明样式（非毛玻璃卡片）。
- 支持鼠标中键关闭标签。
- 重启应用后恢复已打开标签与当前活动标签。
- 记忆标签栏横向滚动位置。

2. 基于工作区的标签分组
- 多标签可按工作区分组管理。
- 支持创建、切换、重命名、删除工作区。
- 每个工作区维护独立的标签集合和活动会话。
- 工作区状态在重启后可恢复。

3. 全新时间线 UI 与稳定性修复
- 修复滚动后时间线消失问题。
- 修复首尾节点显示被裁切问题。
- 活动节点与导航/视口位置对齐。
- 节点悬停显示精简预览（用户输入 + 模型输出）。

4. 会话位置持久化
- 按时间线节点序号保存会话位置。
- 重启应用后可回到该会话上次节点位置。

5. 时间线快捷键
- `Alt+ArrowUp`：跳转到上一节点。
- `Alt+ArrowDown`：跳转到下一节点。
- `Alt+Shift+ArrowUp`：跳转到首节点。
- `Alt+Shift+ArrowDown`：跳转到末节点。

6. 模型分组与路由模式
- 助手可选择使用单模型，或使用模型分组。
- 模型分组为全局共享能力，可在不同助手之间复用。
- 模型分组由用户自由定义，不限制“同模型/同提供商”组合。
- 支持两种路由模式：
  - `order-first`：按分组顺序尝试，前一个不可访问时自动回退到下一个。
  - `round-robin`：请求按模型顺序轮询分发（1->2->3->1...）。
- 可在助手设置和聊天顶部模型切换器中切换“单模型 / 分组”。

7. 生成中继续发送
- 在模型仍在输出时可继续发送下一条消息。

8. Arch Linux PKGBUILD 支持
- 新增 Arch Linux 安装打包文件：
  - `pkgbuilds/arch/cherry-studio-bin/PKGBUILD`
  - `pkgbuilds/arch/cherry-studio-bin/.SRCINFO`
  - `pkgbuilds/arch/README.md`
- 支持 `x86_64` 与 `aarch64`。

## Arch Linux 快速安装

```bash
cd pkgbuilds/arch/cherry-studio-bin
makepkg -si
```
