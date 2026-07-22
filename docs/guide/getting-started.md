# 快速开始

## 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) 稳定版工具链
- 对应平台的 Tauri 系统依赖（见 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)）

## 安装依赖

```bash
git clone https://github.com/openqmt/PeekShell.git
cd PeekShell
npm install
```

## 开发模式

```bash
npm run tauri-dev
```

该命令会启动 Vite 前端与 Tauri 桌面窗口。仅调试前端时可使用：

```bash
npm run dev
```

## 构建发布包

```bash
npm run build
# 或完整桌面安装包：
# npx tauri build
```

## 文档站点

本官网使用 VitePress，文档源码位于仓库 `docs/` 目录：

```bash
npm run docs:dev      # 本地预览
npm run docs:build    # 构建静态站点
npm run docs:preview  # 预览构建结果
```

## 下一步

- [主机管理](/guide/hosts) — 添加并组织 SSH 主机
- [终端](/guide/terminal) — 多标签会话与主机概览
- [远程文件](/guide/remote-explorer) — 浏览与传输文件
- [AI 助手](/guide/ai-agent) — 配置与确认式执行说明
