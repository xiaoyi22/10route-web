// Dashboard probes and internal calls never supply passive health evidence.
export function isBusinessRequest(raw) {
  if (!raw || !/^\/(?:api\/)?(?:v1(?:beta)?\/|responses(?:$|\/)|codex\/)/.test(raw.endpoint || "")) return false;
  const headers = raw.headers || {};
  const get = name => typeof headers.get === "function" ? headers.get(name) : headers[name] || headers[Object.keys(headers).find(key => key.toLowerCase() === name)];
  return !get("x-10r-cli-token") && !get("x-9r-cli-token") && !get("x-10r-observation-source")
    && !/10router-(iq|monitor|probe|test)/i.test(get("user-agent") || "");
}
