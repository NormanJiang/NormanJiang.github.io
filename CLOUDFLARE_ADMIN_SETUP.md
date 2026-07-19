# 管理员发布功能部署教程

网站仍由 GitHub Pages 托管。Cloudflare Worker 只负责验证管理员、接收文章与封面，并把它们提交到 GitHub 仓库。

## 一、准备 Cloudflare 账户

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) 并注册或登录。
2. 免费套餐即可运行这个 Worker，不需要把网站域名转入 Cloudflare。

## 二、创建 GitHub Fine-grained Token

1. 登录 GitHub，打开头像菜单中的 `Settings`。
2. 进入 `Developer settings` → `Personal access tokens` → `Fine-grained tokens`。
3. 点击 `Generate new token`。
4. 填写名称，例如 `Norman Blog Publisher`，并设置合理的过期时间。
5. `Repository access` 选择 `Only select repositories`，只选择 `NormanJiang.github.io`。
6. 在 `Repository permissions` 中把 `Contents` 设为 `Read and write`。`Metadata` 保持自动获得的只读权限，其余权限不要开启。
7. 创建并立即复制 Token。离开页面后 GitHub 不会再次显示完整 Token。

## 三、准备本地 Worker Secret

在 PowerShell 中进入 Worker 目录：

```powershell
Set-Location 'G:\Codex_Creativity\Writing&Photos\worker'
npm.cmd install
Copy-Item .dev.vars.example .dev.vars
```

打开新生成的 `worker\.dev.vars`，填写：

```dotenv
ADMIN_PASSWORD="在这里填写你的管理员密码"
GITHUB_TOKEN="这里粘贴刚创建的 GitHub Fine-grained Token"
SESSION_SECRET="这里填写至少 32 个字符的随机字符串"
```

可以在 PowerShell 中生成 SESSION_SECRET：

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

复制最后输出的一整行到 `SESSION_SECRET`。`.dev.vars` 已加入 `.gitignore`，禁止手动把它提交到 GitHub。

## 四、登录并部署 Cloudflare Worker

仍在 `worker` 目录运行：

```powershell
.\cloudflare-login.cmd
```

浏览器会打开 Cloudflare 授权页面，确认授权后回到 PowerShell。然后把代码和三个 Secret 一起部署：

```powershell
.\cloudflare-deploy.cmd
```

部署成功后会显示类似地址：

```text
https://norman-blog-admin-api.<你的-workers子域>.workers.dev
```

保存这个地址。可以在浏览器打开：

```text
https://norman-blog-admin-api.<你的-workers子域>.workers.dev/health
```

看到 `{"ok":true,...}` 说明 Worker 已上线。

## 五、把 Worker 地址交给网站构建

1. 打开 GitHub 仓库 `NormanJiang/NormanJiang.github.io`。
2. 进入 `Settings` → `Secrets and variables` → `Actions`。
3. 切换到 `Variables` 标签，点击 `New repository variable`。
4. 名称填写 `PUBLIC_ADMIN_API_URL`。
5. Value 填写完整 Worker 地址，不要在末尾加 `/`。

这个地址不是密码，可以作为普通 Repository Variable。密码、GitHub Token 和 SESSION_SECRET 只能放在 Cloudflare Secret 中。

## 六、本地预览管理员功能

在网站根目录创建 `.env`：

```dotenv
PUBLIC_ADMIN_API_URL=https://norman-blog-admin-api.<你的-workers子域>.workers.dev
```

然后运行：

```powershell
Set-Location 'G:\Codex_Creativity\Writing&Photos'
.\dev.cmd
```

打开 `http://localhost:4321/`，点击顶部“管理员”，输入密码后进入 `/admin/`。

## 七、推送网站代码

在网站根目录执行：

```powershell
git add .
git commit -m "Add secure admin publishing"
git push
```

GitHub Actions 会读取 `PUBLIC_ADMIN_API_URL`，构建并部署新版网站。

## 八、以后发布文章

1. 打开网站，点击顶部“管理员”。
2. 输入管理员密码。
3. 填写文章类型、标题、子标题、日期和精选状态。
4. 上传正文 `.md` 与封面图片。
5. 点击“上传并发布”。

Worker 会在一次 Git 提交中创建：

```text
src/content/posts/<日期-标题-随机码>.md
public/images/<日期-标题-随机码>.<图片扩展名>
```

提交到 `main` 后会自动触发 GitHub Pages 工作流。通常等待几分钟，新文章就会出现在首页、时间线和对应分类页。

## 修改密码或 Secret

修改 `worker\.dev.vars` 后重新执行：

```powershell
.\cloudflare-deploy.cmd
```

不要在网页代码、GitHub Repository Variable 或提交记录中填写密码。

## 安全提醒

你当前选择的密码较短，容易遭到尝试。功能可以按该密码运行，但正式长期使用建议把 `ADMIN_PASSWORD` 换成至少 12 位、包含字母和数字的独立密码，然后重新部署 Worker。真实密码只写入本机 `.dev.vars` 和 Cloudflare Secret，不要提交到 Git。
