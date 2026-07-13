# Writing & Photos

一个本地优先的个人图文写作网站，使用 Astro 和 Markdown 内容集合构建。

## 本地预览

由于当前目录名包含 `&`，Windows 下建议直接使用项目自带的 `.cmd` 文件：

```bat
build.cmd
preview.cmd
```

浏览器打开终端显示的本地地址，通常是 `http://127.0.0.1:4321/`。保持 `preview.cmd` 窗口打开即可持续预览；停止时在窗口里按 `Ctrl+C`。

编辑时也可以尝试运行 `dev.cmd` 使用 Astro 开发模式；如果遇到 Astro 7 后台进程状态异常，使用上面的 `build.cmd` + `preview.cmd` 是稳定路径。

## 构建

```bat
build.cmd
```

构建产物会输出到 `dist/`。

## 新增文章

在 `src/content/posts/` 新建一个 Markdown 文件，例如 `new-note.md`：

```md
---
title: "文章标题"
description: "一句简短摘要"
date: 2026-07-14
category: "分类名称"
cover: "/images/your-cover.png"
featured: false
---

正文内容写在这里。
```

图片放在 `public/images/`，分类页会根据文章的 `category` 自动生成。
