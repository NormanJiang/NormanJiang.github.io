(() => {
  const SESSION_KEY = "norman-blog-admin-session";

  const apiUrl = document.body.dataset.adminApiUrl?.replace(/\/$/, "") || "";
  const entry = document.querySelector("[data-admin-entry]");
  const dialog = document.querySelector("[data-admin-login-dialog]");
  const form = document.querySelector("[data-admin-login-form]");
  const close = document.querySelector("[data-admin-dialog-close]");
  const status = document.querySelector("[data-admin-login-status]");
  const password = form?.querySelector('input[name="password"]');

  const setStatus = (message, type = "") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.type = type;
  };

  const openLogin = () => {
    if (!dialog) return;
    setStatus("");
    dialog.showModal();
    requestAnimationFrame(() => password?.focus());
  };

  entry?.addEventListener("click", () => {
    if (sessionStorage.getItem(SESSION_KEY)) {
      window.location.href = "/admin/";
      return;
    }
    openLogin();
  });

  close?.addEventListener("click", () => dialog?.close());
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!apiUrl) {
      setStatus("管理员后端尚未配置，请先完成 Cloudflare Worker 部署。", "error");
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus("正在验证...");

    try {
      const response = await fetch(`${apiUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.token) {
        throw new Error(result.error || "密码不正确");
      }

      sessionStorage.setItem(SESSION_KEY, result.token);
      password.value = "";
      window.location.href = "/admin/";
    } catch (error) {
      setStatus(error.message || "登录失败，请稍后重试。", "error");
    } finally {
      submit.disabled = false;
    }
  });
})();
