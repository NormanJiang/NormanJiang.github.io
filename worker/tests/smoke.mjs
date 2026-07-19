import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = {
  ADMIN_PASSWORD: "test-password",
  GITHUB_TOKEN: "test-token",
  SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
  GITHUB_OWNER: "NormanJiang",
  GITHUB_REPO: "NormanJiang.github.io",
  GITHUB_BRANCH: "main",
  ALLOWED_ORIGINS: "http://localhost:4321"
};

const call = (path, options = {}) => worker.fetch(new Request(`https://worker.test${path}`, options), env);

const blocked = await call("/login", {
  method: "POST",
  headers: { Origin: "https://example.com", "Content-Type": "application/json" },
  body: JSON.stringify({ password: "test-password" })
});
assert.equal(blocked.status, 403);

const wrongPassword = await call("/login", {
  method: "POST",
  headers: { Origin: "http://localhost:4321", "Content-Type": "application/json" },
  body: JSON.stringify({ password: "wrong" })
});
assert.equal(wrongPassword.status, 401);

const login = await call("/login", {
  method: "POST",
  headers: { Origin: "http://localhost:4321", "Content-Type": "application/json" },
  body: JSON.stringify({ password: "test-password" })
});
assert.equal(login.status, 200);
const session = await login.json();
assert.ok(session.token);

const unauthorized = await call("/publish", {
  method: "POST",
  headers: { Origin: "http://localhost:4321" },
  body: new FormData()
});
assert.equal(unauthorized.status, 401);

const invalidPublish = await call("/publish", {
  method: "POST",
  headers: {
    Origin: "http://localhost:4321",
    Authorization: `Bearer ${session.token}`
  },
  body: new FormData()
});
assert.equal(invalidPublish.status, 400);

console.log("Worker smoke tests passed.");
