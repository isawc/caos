const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caos-tests-"));
process.env.CAOS_DATA_FILE = path.join(tempDir, "data.json");

const { createServer, readData } = require("../server");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return { body, headers: response.headers, status: response.status };
}

test("CAOS API flow", async (t) => {
  const server = createServer();
  const baseUrl = await listen(server);

  t.after(async () => {
    await close(server);
    fs.rmSync(tempDir, { force: true, recursive: true });
  });

  await t.test("starts with an active event and an empty list", async () => {
    const response = await request(baseUrl, "/api/public/active-event");

    assert.equal(response.status, 200);
    assert.equal(response.body.event.name, "CAOS - After Night");
    assert.equal(response.body.event.count, 0);
  });

  await t.test("blocks admin state without password", async () => {
    const response = await request(baseUrl, "/api/admin/state");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Acesso admin necessário.");
  });

  await t.test("rejects wrong admin password", async () => {
    const response = await request(baseUrl, "/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "errada" })
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Senha incorreta.");
  });

  let token = "";
  await t.test("accepts correct admin password", async () => {
    const response = await request(baseUrl, "/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "caos123" })
    });

    assert.equal(response.status, 200);
    assert.match(response.body.token, /^[a-f0-9]{48}$/);
    token = response.body.token;
  });

  await t.test("adds public names and trims invalid entries", async () => {
    const response = await request(baseUrl, "/api/public/names", {
      method: "POST",
      body: JSON.stringify({ names: [" Isaac Alvarenga ", "", "  Maria  Clara  "] })
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.added, 2);
    assert.equal(response.body.event.count, 2);

    const data = readData();
    assert.deepEqual(
      data.events[0].names.map((entry) => entry.name),
      ["Isaac Alvarenga", "Maria Clara"]
    );
  });

  await t.test("returns admin state with event names", async () => {
    const response = await request(baseUrl, "/api/admin/state", {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.events.length, 1);
    assert.equal(response.body.events[0].names.length, 2);
  });

  let newEventId = "";
  await t.test("creates a new event and makes it active", async () => {
    const response = await request(baseUrl, "/api/admin/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "CAOS - Teste", date: "2026-08-01" })
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.event.name, "CAOS - Teste");
    assert.deepEqual(response.body.event.names, []);
    newEventId = response.body.event.id;

    const publicResponse = await request(baseUrl, "/api/public/active-event");
    assert.equal(publicResponse.body.event.id, newEventId);
    assert.equal(publicResponse.body.event.count, 0);
  });

  await t.test("exports CSV for the active event", async () => {
    await request(baseUrl, "/api/public/names", {
      method: "POST",
      body: JSON.stringify({ names: ["Nome CSV"] })
    });

    const response = await request(baseUrl, `/api/admin/events/${newEventId}/export?token=${token}`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition"), /caos-teste-lista\.csv/);
    assert.match(response.body, /"Evento","Data","Nome","Criado em"/);
    assert.match(response.body, /"CAOS - Teste","2026-08-01","Nome CSV"/);
  });

  await t.test("deletes one name from an event", async () => {
    const state = await request(baseUrl, "/api/admin/state", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const activeEvent = state.body.events.find((event) => event.id === newEventId);
    const nameId = activeEvent.names[0].id;

    const response = await request(baseUrl, `/api/admin/events/${newEventId}/names/${nameId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 200);

    const publicResponse = await request(baseUrl, "/api/public/active-event");
    assert.equal(publicResponse.body.event.count, 0);
  });

  await t.test("clears all names from an event", async () => {
    await request(baseUrl, "/api/public/names", {
      method: "POST",
      body: JSON.stringify({ names: ["Pessoa 1", "Pessoa 2"] })
    });

    const response = await request(baseUrl, `/api/admin/events/${newEventId}/names`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(response.status, 200);

    const publicResponse = await request(baseUrl, "/api/public/active-event");
    assert.equal(publicResponse.body.event.count, 0);
  });

  await t.test("updates admin password", async () => {
    const updateResponse = await request(baseUrl, "/api/admin/password", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: "novaSenha" })
    });

    assert.equal(updateResponse.status, 200);

    const oldLogin = await request(baseUrl, "/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "caos123" })
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await request(baseUrl, "/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: "novaSenha" })
    });
    assert.equal(newLogin.status, 200);
  });
});
