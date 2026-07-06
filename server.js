const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DATA_FILE = process.env.CAOS_DATA_FILE || path.join(__dirname, "data.json");
const sessions = new Set();

const defaultData = {
  adminPassword: "caos123",
  activeEventId: "demo-event",
  events: [
    {
      id: "demo-event",
      name: "CAOS - After Night",
      date: new Date().toISOString().slice(0, 10),
      names: [],
      createdAt: new Date().toISOString()
    }
  ]
};

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    writeData(defaultData);
  }

  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Conteúdo muito grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON inválido."));
      }
    });
  });
}

function getToken(req, url) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return url.searchParams.get("token") || "";
}

function isAuthed(req, url) {
  return sessions.has(getToken(req, url));
}

function activeEvent(data) {
  return data.events.find((event) => event.id === data.activeEventId) || null;
}

function cleanNames(names) {
  if (!Array.isArray(names)) return [];
  return names
    .map((name) => String(name).trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 50);
}

function publicEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    count: event.names.length
  };
}

function csvEscape(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function handleApi(req, res, url) {
  const data = readData();

  if (req.method === "GET" && url.pathname === "/api/public/active-event") {
    return sendJson(res, 200, { event: publicEvent(activeEvent(data)) });
  }

  if (req.method === "POST" && url.pathname === "/api/public/names") {
    const event = activeEvent(data);
    if (!event) return sendError(res, 400, "Nenhum evento aberto no momento.");

    const body = await getBody(req);
    const names = cleanNames(body.names);
    if (!names.length) return sendError(res, 400, "Envie pelo menos um nome.");

    const now = new Date().toISOString();
    event.names.push(...names.map((name) => ({ id: crypto.randomUUID(), name, createdAt: now })));
    writeData(data);
    return sendJson(res, 201, { added: names.length, event: publicEvent(event) });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await getBody(req);
    if (body.password !== data.adminPassword) return sendError(res, 401, "Senha incorreta.");

    const token = crypto.randomBytes(24).toString("hex");
    sessions.add(token);
    return sendJson(res, 200, { token });
  }

  if (url.pathname.startsWith("/api/admin/") && !isAuthed(req, url)) {
    return sendError(res, 401, "Acesso admin necessário.");
  }

  if (req.method === "GET" && url.pathname === "/api/admin/state") {
    return sendJson(res, 200, {
      activeEventId: data.activeEventId,
      events: data.events
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/events") {
    const body = await getBody(req);
    const name = String(body.name || "").trim();
    const date = String(body.date || "").trim();
    if (!name || !date) return sendError(res, 400, "Nome e data são obrigatórios.");

    const event = {
      id: crypto.randomUUID(),
      name,
      date,
      names: [],
      createdAt: new Date().toISOString()
    };
    data.events.push(event);
    data.activeEventId = event.id;
    writeData(data);
    return sendJson(res, 201, { event });
  }

  const activateMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/activate$/);
  if (req.method === "POST" && activateMatch) {
    const event = data.events.find((item) => item.id === activateMatch[1]);
    if (!event) return sendError(res, 404, "Evento não encontrado.");
    data.activeEventId = event.id;
    writeData(data);
    return sendJson(res, 200, { activeEventId: event.id });
  }

  const deleteEventMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)$/);
  if (req.method === "DELETE" && deleteEventMatch) {
    data.events = data.events.filter((event) => event.id !== deleteEventMatch[1]);
    if (data.activeEventId === deleteEventMatch[1]) {
      data.activeEventId = data.events[0]?.id || null;
    }
    writeData(data);
    return sendJson(res, 200, { ok: true });
  }

  const clearNamesMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/names$/);
  if (req.method === "DELETE" && clearNamesMatch) {
    const event = data.events.find((item) => item.id === clearNamesMatch[1]);
    if (!event) return sendError(res, 404, "Evento não encontrado.");
    event.names = [];
    writeData(data);
    return sendJson(res, 200, { ok: true });
  }

  const deleteNameMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/names\/([^/]+)$/);
  if (req.method === "DELETE" && deleteNameMatch) {
    const event = data.events.find((item) => item.id === deleteNameMatch[1]);
    if (!event) return sendError(res, 404, "Evento não encontrado.");
    event.names = event.names.filter((name) => name.id !== deleteNameMatch[2]);
    writeData(data);
    return sendJson(res, 200, { ok: true });
  }

  const exportMatch = url.pathname.match(/^\/api\/admin\/events\/([^/]+)\/export$/);
  if (req.method === "GET" && exportMatch) {
    const event = data.events.find((item) => item.id === exportMatch[1]);
    if (!event) return sendError(res, 404, "Evento não encontrado.");

    const rows = [["Evento", "Data", "Nome", "Criado em"]];
    event.names.forEach((entry) => rows.push([event.name, event.date, entry.name, entry.createdAt]));
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const filename = event.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");

    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename || "caos"}-lista.csv"`
    });
    return res.end(csv);
  }

  if (req.method === "POST" && url.pathname === "/api/admin/password") {
    const body = await getBody(req);
    const password = String(body.password || "").trim();
    if (password.length < 4) return sendError(res, 400, "A senha precisa ter pelo menos 4 caracteres.");
    data.adminPassword = password;
    writeData(data);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/reset-demo") {
    writeData(defaultData);
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 404, "Rota não encontrada.");
}

function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }

      serveStatic(req, res, url);
    } catch (error) {
      sendError(res, 500, error.message || "Erro interno.");
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`CAOS rodando em http://localhost:${PORT}`);
    console.log("Senha admin inicial: caos123");
  });
}

module.exports = {
  createServer,
  defaultData,
  readData,
  writeData
};
