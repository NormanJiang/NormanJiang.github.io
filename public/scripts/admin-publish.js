(() => {
  const SESSION_KEY = "norman-blog-admin-session";
  const token = sessionStorage.getItem(SESSION_KEY);
  const apiUrl = document.body.dataset.adminApiUrl?.replace(/\/$/, "") || "";
  const form = document.querySelector("[data-admin-publish-form]");
  const locked = document.querySelector("[data-admin-locked]");
  const dateInput = document.querySelector("[data-admin-date]");
  const coverInput = document.querySelector("[data-admin-cover]");
  const coverPreview = document.querySelector("[data-admin-cover-preview]");
  const coverImage = document.querySelector("[data-admin-cover-image]");
  const status = document.querySelector("[data-admin-publish-status]");
  const commitLink = document.querySelector("[data-admin-commit-link]");
  let previewUrl = "";

  const localDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  };

  const setStatus = (message, type = "") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  };

  if (dateInput) dateInput.value = localDate();

  if (!token || !apiUrl) {
    locked.hidden = false;
    form.hidden = true;
    if (!apiUrl) {
      locked.querySelector("p").textContent = "Cloudflare Worker 尚未配置，请先完成部署教程。";
    }
  } else {
    locked.hidden = true;
    form.hidden = false;
  }

  document.querySelector("[data-admin-login-open]")?.addEventListener("click", () => {
    document.querySelector("[data-admin-entry]")?.click();
  });

  document.querySelector("[data-admin-logout]")?.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = "/";
  });

  coverInput?.addEventListener("change", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = coverInput.files?.[0];
    if (!file) {
      coverPreview.hidden = true;
      return;
    }
    previewUrl = URL.createObjectURL(file);
    coverImage.src = previewUrl;
    coverPreview.hidden = false;
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const activeToken = sessionStorage.getItem(SESSION_KEY);
    if (!activeToken) {
      form.hidden = true;
      locked.hidden = false;
      return;
    }

    const button = document.querySelector("[data-admin-publish-button]");
    button.disabled = true;
    commitLink.hidden = true;
    setStatus("正在上传并创建 GitHub 提交...");

    try {
      const response = await fetch(`${apiUrl}/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${activeToken}` },
        body: new FormData(form)
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        throw new Error("登录已过期，请重新验证密码。");
      }
      if (!response.ok) throw new Error(result.error || "发布失败，请稍后重试。");

      setStatus("文章已提交。GitHub Pages 正在重新构建，通常需要几分钟。", "success");
      if (result.commitUrl) {
        commitLink.href = result.commitUrl;
        commitLink.hidden = false;
      }
      form.querySelector('input[name="markdown"]').value = "";
      coverInput.value = "";
      coverPreview.hidden = true;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
    } catch (error) {
      setStatus(error.message || "发布失败，请稍后重试。", "error");
    } finally {
      button.disabled = false;
    }
  });
})();
