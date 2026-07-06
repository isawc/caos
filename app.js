const els = {
  navLinks: document.querySelectorAll(".nav-link"),
  guestView: document.querySelector("#guest-view"),
  adminView: document.querySelector("#admin-view"),
  guestForm: document.querySelector("#guest-form"),
  guestNames: document.querySelector("#guest-names"),
  guestStatus: document.querySelector("#guest-status"),
  guestCount: document.querySelector("#guest-count"),
  guestEventLine: document.querySelector("#guest-event-line"),
  clearGuestForm: document.querySelector("#clear-guest-form"),
  closedMessage: document.querySelector("#closed-message"),
  adminGrid: document.querySelector(".admin-grid"),
  loginPanel: document.querySelector("#login-panel"),
  loginForm: document.querySelector("#login-form"),
  loginStatus: document.querySelector("#login-status"),
  adminPassword: document.querySelector("#admin-password"),
  adminContent: document.querySelector("#admin-content"),
  logoutButton: document.querySelector("#logout-button"),
  eventForm: document.querySelector("#event-form"),
  eventName: document.querySelector("#event-name"),
  eventDate: document.querySelector("#event-date"),
  activePill: document.querySelector("#active-pill"),
  adminCount: document.querySelector("#admin-count"),
  adminEventsCount: document.querySelector("#admin-events-count"),
  eventList: document.querySelector("#event-list"),
  nameList: document.querySelector("#name-list"),
  nameSearch: document.querySelector("#name-search"),
  nameSearchStatus: document.querySelector("#name-search-status"),
  exportList: document.querySelector("#export-list"),
  clearActiveList: document.querySelector("#clear-active-list"),
  seedDemo: document.querySelector("#seed-demo"),
  passwordForm: document.querySelector("#password-form"),
  newPassword: document.querySelector("#new-password"),
  settingsStatus: document.querySelector("#settings-status"),
  eventCardTemplate: document.querySelector("#event-card-template"),
  nameRowTemplate: document.querySelector("#name-row-template")
};

let adminToken = sessionStorage.getItem("caos-admin-token") || "";
let adminState = null;

async function api(path, options = {}) {
  let response;

  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error("Servidor offline. Abra pelo iniciar-site.bat ou rode node server.js.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Erro inesperado.");
  }

  return response.json();
}

function formatDate(dateValue) {
  if (!dateValue) return "sem data";
  const [year, month, day] = dateValue.split("-");
  return `${day}/${month}/${year}`;
}

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.className = `status-message ${type}`.trim();
}

function cleanNames(value) {
  return value
    .split(/\n|,/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

async function loadGuest() {
  try {
    const data = await api("/api/public/active-event");
    renderGuest(data.event);
    setStatus(els.guestStatus, "");
  } catch (error) {
    renderGuest(null);
    els.guestForm.hidden = false;
    els.closedMessage.hidden = true;
    els.guestEventLine.textContent = error.message;
    setStatus(els.guestStatus, error.message, "error");
  }
}

async function loadAdmin() {
  if (!adminToken) {
    renderAdminLoggedOut();
    return;
  }

  try {
    adminState = await api("/api/admin/state");
    renderAdminLoggedIn();
  } catch {
    adminToken = "";
    sessionStorage.removeItem("caos-admin-token");
    renderAdminLoggedOut();
  }
}

function renderGuest(event) {
  const hasEvent = Boolean(event);
  els.guestForm.hidden = !hasEvent;
  els.closedMessage.hidden = hasEvent;
  els.guestCount.textContent = event ? event.count : "0";
  els.guestEventLine.textContent = event
    ? `${event.name} • ${formatDate(event.date)}`
    : "Nenhum evento aberto no momento.";
}

function renderAdminLoggedOut() {
  els.adminGrid.classList.remove("logged-in");
  els.loginPanel.hidden = false;
  els.adminContent.hidden = true;
}

function renderAdminLoggedIn() {
  els.adminGrid.classList.add("logged-in");
  els.loginPanel.hidden = true;
  els.adminContent.hidden = false;

  const activeEvent = adminState.events.find((event) => event.id === adminState.activeEventId);
  els.activePill.textContent = activeEvent ? activeEvent.name : "Nenhum";
  els.adminCount.textContent = activeEvent ? activeEvent.names.length : "0";
  els.adminEventsCount.textContent = adminState.events.length;

  renderEvents();
  renderNames(activeEvent);
}

function renderEvents() {
  els.eventList.innerHTML = "";

  if (!adminState.events.length) {
    els.eventList.innerHTML = '<p class="empty">Nenhum evento criado ainda.</p>';
    return;
  }

  adminState.events
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .forEach((event) => {
      const node = els.eventCardTemplate.content.firstElementChild.cloneNode(true);
      node.classList.toggle("active", event.id === adminState.activeEventId);
      node.querySelector("h3").textContent = event.name;
      node.querySelector("p").textContent = `${formatDate(event.date)} • ${event.names.length} nomes`;

      const activateButton = node.querySelector(".activate");
      activateButton.textContent = event.id === adminState.activeEventId ? "Ativo" : "Ativar";
      activateButton.disabled = event.id === adminState.activeEventId;
      activateButton.addEventListener("click", async () => {
        await api(`/api/admin/events/${event.id}/activate`, { method: "POST" });
        await refreshAll();
      });

      node.querySelector(".remove").addEventListener("click", async () => {
        const canRemove = confirm(`Excluir o evento "${event.name}" e todos os nomes dele?`);
        if (!canRemove) return;
        await api(`/api/admin/events/${event.id}`, { method: "DELETE" });
        await refreshAll();
      });

      els.eventList.appendChild(node);
    });
}

function renderNames(event) {
  els.nameList.innerHTML = "";
  const query = els.nameSearch.value.trim().toLowerCase();

  if (!event || !event.names.length) {
    els.nameList.innerHTML = '<p class="empty">Ainda não tem nomes no evento ativo.</p>';
    els.nameSearchStatus.textContent = "Nenhum nome cadastrado nesse evento.";
    return;
  }

  const visibleNames = query
    ? event.names.filter((entry) => entry.name.toLowerCase().includes(query))
    : event.names;

  els.nameSearchStatus.textContent = query
    ? `${visibleNames.length} resultado(s) encontrado(s) de ${event.names.length} nome(s).`
    : `${event.names.length} nome(s) na lista.`;

  if (!visibleNames.length) {
    els.nameList.innerHTML = '<p class="empty">Nome nao encontrado na lista.</p>';
    return;
  }

  visibleNames.forEach((entry) => {
    const node = els.nameRowTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("span").textContent = entry.name;
    node.querySelector("button").addEventListener("click", async () => {
      await api(`/api/admin/events/${event.id}/names/${entry.id}`, { method: "DELETE" });
      await refreshAll();
    });
    els.nameList.appendChild(node);
  });
}

async function refreshAll() {
  await loadGuest();
  await loadAdmin();
}

function setRoute(route) {
  const showAdmin = route === "admin";
  els.guestView.classList.toggle("active", !showAdmin);
  els.adminView.classList.toggle("active", showAdmin);

  els.navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });
}

window.addEventListener("hashchange", () => {
  setRoute(location.hash === "#admin" ? "admin" : "guest");
});

els.guestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const names = cleanNames(els.guestNames.value);
  if (!names.length) {
    setStatus(els.guestStatus, "Digite pelo menos um nome.", "error");
    return;
  }

  try {
    await api("/api/public/names", {
      method: "POST",
      body: JSON.stringify({ names })
    });
    els.guestNames.value = "";
    setStatus(els.guestStatus, `${names.length} nome(s) adicionado(s) na lista.`, "success");
    await refreshAll();
  } catch (error) {
    setStatus(els.guestStatus, error.message, "error");
  }
});

els.clearGuestForm.addEventListener("click", () => {
  els.guestNames.value = "";
  setStatus(els.guestStatus, "");
});

els.nameSearch.addEventListener("input", () => {
  const event = adminState?.events.find((item) => item.id === adminState.activeEventId);
  renderNames(event);
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: els.adminPassword.value })
    });
    adminToken = data.token;
    sessionStorage.setItem("caos-admin-token", adminToken);
    els.adminPassword.value = "";
    setStatus(els.loginStatus, "");
    await loadAdmin();
  } catch (error) {
    setStatus(els.loginStatus, error.message, "error");
  }
});

els.logoutButton.addEventListener("click", () => {
  adminToken = "";
  sessionStorage.removeItem("caos-admin-token");
  renderAdminLoggedOut();
});

els.eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/api/admin/events", {
    method: "POST",
    body: JSON.stringify({
      name: els.eventName.value.trim(),
      date: els.eventDate.value
    })
  });
  els.eventForm.reset();
  els.eventDate.value = new Date().toISOString().slice(0, 10);
  await refreshAll();
});

els.exportList.addEventListener("click", () => {
  if (!adminState?.activeEventId) return;
  window.location.href = `/api/admin/events/${adminState.activeEventId}/export?token=${encodeURIComponent(adminToken)}`;
});

els.clearActiveList.addEventListener("click", async () => {
  const event = adminState?.events.find((item) => item.id === adminState.activeEventId);
  if (!event) return;

  const canClear = confirm(`Limpar todos os nomes de "${event.name}"?`);
  if (!canClear) return;

  await api(`/api/admin/events/${event.id}/names`, { method: "DELETE" });
  await refreshAll();
});

els.seedDemo.addEventListener("click", async () => {
  const canRestore = confirm("Restaurar o exemplo inicial? Isso troca os dados salvos no servidor.");
  if (!canRestore) return;

  await api("/api/admin/reset-demo", { method: "POST" });
  await refreshAll();
});

els.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = els.newPassword.value.trim();
  if (password.length < 4) {
    setStatus(els.settingsStatus, "A senha precisa ter pelo menos 4 caracteres.", "error");
    return;
  }

  await api("/api/admin/password", {
    method: "POST",
    body: JSON.stringify({ password })
  });
  els.passwordForm.reset();
  setStatus(els.settingsStatus, "Senha atualizada.", "success");
});

els.eventDate.value = new Date().toISOString().slice(0, 10);
setRoute(location.hash === "#admin" ? "admin" : "guest");
refreshAll().catch(() => {});
