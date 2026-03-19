const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const panelPrivateKeyPath = path.join(__dirname, "..", "data", "keys", "panel_rsa_private.pem");

let cachedPrivateKey = null;

function getPanelPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;
  cachedPrivateKey = fs.readFileSync(panelPrivateKeyPath, "utf8");
  return cachedPrivateKey;
}

function canonical(method, pathName, ts, nonce, body) {
  return `${String(method).toUpperCase()}\n${pathName}\n${ts}\n${nonce}\n${JSON.stringify(body || {})}`;
}

function signHmac(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function signRsa(payload, privateKeyPem) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(payload);
  signer.end();
  return signer.sign(privateKeyPem, "base64");
}

async function postJson(url, headers, body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(headers || {}),
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    if (!response.ok) {
      const message = parsed.error || parsed.raw || response.statusText;
      throw new Error(`Wings error ${response.status}: ${message}`);
    }

    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeNode(node) {
  const token = node.token || node.secret;
  const panelSecret = node.panelSecret || node.agentSecret || node.secret;
  return {
    ...node,
    url: String(node.url || "").replace(/\/$/, ""),
    token,
    panelSecret,
    protocol: node.protocol || "signed",
  };
}

async function signedPost(node, pathName, body) {
  const normalized = normalizeNode(node);
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID();
  const payload = canonical("POST", pathName, ts, nonce, body);
  const token = normalized.token;
  const panelSecret = normalized.panelSecret;

  if (!token || !panelSecret) {
    throw new Error("Node token/secret missing");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "x-node-id": normalized.id,
    "x-ts": ts,
    "x-nonce": nonce,
    "x-signature": signHmac(payload, token),
    "x-rsa-signature": signRsa(payload, getPanelPrivateKey()),
    "x-panel-secret": panelSecret,
  };

  return postJson(`${normalized.url}${pathName}`, headers, body);
}

async function legacyPost(node, pathName, body) {
  return postJson(`${node.url}${pathName}`, { "x-node-secret": node.secret }, body);
}

async function callNodeEndpoint(node, pathName, body) {
  const mode = (node.protocol || "signed").toLowerCase();
  if (mode === "legacy") {
    return legacyPost(node, pathName, body);
  }
  return signedPost(node, pathName, body);
}

async function callNodeCommand(node, payload) {
  const mode = (node.protocol || "signed").toLowerCase();
  if (mode === "legacy") {
    return legacyPost(node, "/command", payload);
  }

  const action = payload.action;
  const server = payload.server || {};

  switch (action) {
    case "create_server":
      return signedPost(node, "/server/create", {
        uuid: server.uuid,
        runtime: server.runtime,
        entrypoint: server.entryFile,
        image: server.image,
        start_command: server.startCommand || null,
        template_id: server.templateId || null,
        runtime_version: server.runtimeVersion || null,
        limits: {
          ram_mb: server.ramLimitMb,
          cpu_percent: server.cpuLimitPercent,
        },
      });
    case "delete_server":
      return signedPost(node, "/server/delete", { uuid: server.uuid });
    case "start_server":
      return signedPost(node, "/server/start", { uuid: server.uuid });
    case "stop_server":
      return signedPost(node, "/server/stop", { uuid: server.uuid });
    case "restart_server":
      return signedPost(node, "/server/restart", { uuid: server.uuid });
    case "kill_server":
      return signedPost(node, "/server/kill", { uuid: server.uuid });
    case "exec_server":
      return signedPost(node, "/server/exec", { uuid: server.uuid, command: payload.command });
    default:
      throw new Error(`Unsupported node action: ${action}`);
  }
}

async function callNodeFiles(node, payload) {
  const mode = (node.protocol || "signed").toLowerCase();
  if (mode === "legacy") {
    return legacyPost(node, "/files", payload);
  }

  const action = payload.action;
  const server = payload.server || {};
  const pathValue = payload.path || ".";

  switch (action) {
    case "list":
      return signedPost(node, "/server/files/list", { uuid: server.uuid, path: pathValue });
    case "mkdir":
      return signedPost(node, "/server/files/mkdir", { uuid: server.uuid, path: pathValue });
    case "upload":
      return signedPost(node, "/server/files/upload", {
        uuid: server.uuid,
        relative_path: pathValue,
        base64: payload.contentBase64,
      });
    case "delete":
      return signedPost(node, "/server/files/delete", {
        uuid: server.uuid,
        relative_path: pathValue,
      });
    case "download":
      return signedPost(node, "/server/files/download", {
        uuid: server.uuid,
        relative_path: pathValue,
      });
    default:
      throw new Error(`Unsupported file action: ${action}`);
  }
}

module.exports = {
  callNodeCommand,
  callNodeFiles,
  callNodeEndpoint,
};
