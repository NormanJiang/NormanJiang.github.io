const encoder = new TextEncoder();
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;

const imageExtensions = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"]
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = getCorsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (!cors) return json({ error: "不允许的来源。" }, 403);
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "norman-blog-admin-api" }, 200, cors || undefined);
    }

    if (!cors) return json({ error: "不允许的来源。" }, 403);

    try {
      validateEnvironment(env);

      if (url.pathname === "/login" && request.method === "POST") {
        return await login(request, env, cors);
      }

      if (url.pathname === "/publish" && request.method === "POST") {
        return await publish(request, env, cors);
      }

      return json({ error: "接口不存在。" }, 404, cors);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "服务器处理失败，请稍后重试。";
      if (!(error instanceof HttpError)) console.error(error);
      return json({ error: message }, status, cors);
    }
  }
};

async function login(request, env, cors) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const matches = await constantTimeEqual(password, env.ADMIN_PASSWORD);

  if (!matches) {
    await delay(450);
    throw new HttpError(401, "密码不正确。");
  }

  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = await createSessionToken(expiresAt, env.SESSION_SECRET);
  return json({ token, expiresAt }, 200, cors);
}

async function publish(request, env, cors) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!(await verifySessionToken(token, env.SESSION_SECRET))) {
    throw new HttpError(401, "登录已过期，请重新验证密码。");
  }

  const form = await request.formData();
  const category = getRequiredText(form, "category", 80);
  const title = getRequiredText(form, "title", 120);
  const description = getRequiredText(form, "description", 240);
  const publishDate = getRequiredText(form, "date", 10);
  const featured = form.get("featured") === "true";
  const markdown = form.get("markdown");
  const cover = form.get("cover");

  if (!isValidDate(publishDate)) throw new HttpError(400, "发布日期无效。");
  if (!(markdown instanceof File) || !markdown.name.toLowerCase().endsWith(".md") || markdown.size === 0) {
    throw new HttpError(400, "请上传有效的 Markdown 文件。");
  }
  if (markdown.size > MAX_MARKDOWN_BYTES) throw new HttpError(400, "Markdown 文件不能超过 2MB。");
  if (!(cover instanceof File) || cover.size === 0 || !imageExtensions.has(cover.type)) {
    throw new HttpError(400, "请上传 PNG、JPG、WebP、GIF 或 AVIF 封面。");
  }
  if (cover.size > MAX_COVER_BYTES) throw new HttpError(400, "封面图片不能超过 10MB。");

  const rawBody = stripFrontmatter(await markdown.text());
  if (!rawBody.trim()) throw new HttpError(400, "Markdown 正文不能为空。");

  const uniquePart = crypto.randomUUID().slice(0, 8);
  const safeTitle = safePathPart(title) || "article";
  const articleId = `${publishDate}-${safeTitle}-${uniquePart}`;
  const imageExtension = imageExtensions.get(cover.type);
  const imageName = `${articleId}.${imageExtension}`;
  const markdownPath = `src/content/posts/${articleId}.md`;
  const imagePath = `public/images/${imageName}`;
  const coverPublicPath = `/images/${imageName}`;
  const markdownContent = buildMarkdown({
    title,
    description,
    publishDate,
    category,
    cover: coverPublicPath,
    featured,
    body: rawBody
  });

  const result = await commitFiles(env, [
    { path: markdownPath, bytes: encoder.encode(markdownContent) },
    { path: imagePath, bytes: new Uint8Array(await cover.arrayBuffer()) }
  ], `Publish article: ${title}`);

  return json({
    ok: true,
    articleId,
    markdownPath,
    imagePath,
    commitUrl: result.commitUrl
  }, 201, cors);
}

async function commitFiles(env, files, message) {
  const branch = env.GITHUB_BRANCH || "main";
  const ref = await githubRequest(env, `/git/ref/heads/${encodeURIComponent(branch)}`);
  const parentSha = ref.object.sha;
  const parentCommit = await githubRequest(env, `/git/commits/${parentSha}`);

  const blobs = await Promise.all(files.map((file) => githubRequest(env, "/git/blobs", {
    method: "POST",
    body: {
      content: bytesToBase64(file.bytes),
      encoding: "base64"
    }
  })));

  const tree = await githubRequest(env, "/git/trees", {
    method: "POST",
    body: {
      base_tree: parentCommit.tree.sha,
      tree: files.map((file, index) => ({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blobs[index].sha
      }))
    }
  });

  const commit = await githubRequest(env, "/git/commits", {
    method: "POST",
    body: {
      message,
      tree: tree.sha,
      parents: [parentSha]
    }
  });

  await githubRequest(env, `/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    body: { sha: commit.sha, force: false }
  });

  return {
    sha: commit.sha,
    commitUrl: `https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/commit/${commit.sha}`
  };
}

async function githubRequest(env, path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "norman-blog-admin-worker",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.message === "string" ? data.message : "GitHub API 请求失败";
    if (response.status === 409 || response.status === 422) {
      throw new HttpError(409, "仓库刚刚发生变化，请重新提交一次。");
    }
    console.error("GitHub API error", response.status, detail);
    throw new HttpError(502, "无法写入 GitHub 仓库，请检查 Token 权限和仓库配置。");
  }
  return data;
}

function getRequiredText(form, name, maxLength) {
  const value = form.get(name);
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new HttpError(400, `缺少字段：${name}`);
  if (text.length > maxLength) throw new HttpError(400, `${name} 内容过长。`);
  return text;
}

function buildMarkdown({ title, description, publishDate, category, cover, featured, body }) {
  return [
    "---",
    `title: "${escapeYaml(title)}"`,
    `description: "${escapeYaml(description)}"`,
    `date: ${publishDate}`,
    `category: "${escapeYaml(category)}"`,
    `cover: "${escapeYaml(cover)}"`,
    `featured: ${featured}`,
    "---",
    "",
    body.trim(),
    ""
  ].join("\n");
}

function stripFrontmatter(value) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/^\s*---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "")
    .trim();
}

function escapeYaml(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");
}

function safePathPart(value) {
  return value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 72);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function validateEnvironment(env) {
  const required = ["ADMIN_PASSWORD", "GITHUB_TOKEN", "SESSION_SECRET", "GITHUB_OWNER", "GITHUB_REPO"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new HttpError(500, "管理员后端尚未完成配置。");
  if (env.SESSION_SECRET.length < 32) throw new HttpError(500, "SESSION_SECRET 长度不足。");
}

function getCorsHeaders(origin, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

async function createSessionToken(expiresAt, secret) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
    exp: expiresAt,
    nonce: crypto.randomUUID()
  })));
  const signature = await sign(payload, secret);
  return `${payload}.${bytesToBase64Url(signature)}`;
}

async function verifySessionToken(token, secret) {
  const [payload, encodedSignature, ...extra] = token.split(".");
  if (!payload || !encodedSignature || extra.length) return false;

  try {
    const key = await importHmacKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(encodedSignature),
      encoder.encode(payload)
    );
    if (!valid) return false;

    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    return Number.isFinite(session.exp) && session.exp > Date.now();
  } catch {
    return false;
  }
}

async function sign(value, secret) {
  const key = await importHmacKey(secret, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function importHmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

async function constantTimeEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right))
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
