import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyASVdh9UG55JAoclIKIUYDiBwg46BbShsQ",
  authDomain: "db-morchis.firebaseapp.com",
  projectId: "db-morchis",
  storageBucket: "db-morchis.firebasestorage.app",
  messagingSenderId: "205649766641",
  appId: "1:205649766641:web:1577d62a14040c7999a150",
};

const ALLOWED_EMAILS = new Set([
  "alekcaballeromusic@gmail.com",
  "catalina.medina.leal@gmail.com",
]);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const $ = (id) => document.getElementById(id);
const fmt = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });
const todayISO = () => new Date().toISOString().slice(0, 10);

let currentUser = null;
let desserts = [];
let logs = [];
let editingDessertId = null;
let eatingDessertId = null;
let activeTab = "dashboard";
let activeSuggestion = null;
let unsubDesserts = null;
let unsubLogs = null;

const nodes = {
  authScreen: $("authScreen"),
  appShell: $("appShell"),
  authMessage: $("authMessage"),
  btnLogin: $("btnLogin"),
  btnLogout: $("btnLogout"),
  btnImportLocal: $("btnImportLocal"),
  userAvatar: $("userAvatar"),
  userName: $("userName"),
  userEmail: $("userEmail"),
  statsGrid: $("statsGrid"),
  dessertGrid: $("dessertGrid"),
  searchInput: $("searchInput"),
  filterSelect: $("filterSelect"),
  historyRangeSelect: $("historyRangeSelect"),
  historyTimeline: $("historyTimeline"),
  recentLogs: $("recentLogs"),
  wishlistPreview: $("wishlistPreview"),
  rotationInsights: $("rotationInsights"),
  riskBadge: $("riskBadge"),
  todaySuggestionName: $("todaySuggestionName"),
  todaySuggestionReason: $("todaySuggestionReason"),
  btnEatSuggestion: $("btnEatSuggestion"),
  suggestionResults: $("suggestionResults"),
  cravingSelect: $("cravingSelect"),
  avoidDaysSelect: $("avoidDaysSelect"),
  modeSelect: $("modeSelect"),
  dessertModal: $("dessertModal"),
  dessertForm: $("dessertForm"),
  dessertModalTitle: $("dessertModalTitle"),
  btnDeleteDessert: $("btnDeleteDessert"),
  eatModal: $("eatModal"),
  eatForm: $("eatForm"),
  eatModalTitle: $("eatModalTitle"),
  eatDate: $("eatDate"),
  eatBy: $("eatBy"),
  eatRating: $("eatRating"),
  eatNotes: $("eatNotes"),
  toast: $("toast"),
};

const fieldIds = [
  "dessertName",
  "dessertCategory",
  "dessertStatus",
  "dessertRating",
  "dessertTexture",
  "dessertSweetness",
  "dessertPlace",
  "dessertTags",
  "dessertNotes",
];

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  nodes.toast.textContent = message;
  nodes.toast.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => nodes.toast.classList.add("hidden"), 3100);
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseTags(value = "") {
  return value
    .split(",")
    .map((tag) => normalize(tag))
    .filter(Boolean)
    .slice(0, 12);
}

function dateFromFirestore(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value) {
  const date = dateFromFirestore(value);
  if (!date) return 9999;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function formatDate(value) {
  const date = dateFromFirestore(value);
  return date ? fmt.format(date) : "Sin fecha";
}

function stars(rating = 0) {
  const n = Number(rating) || 0;
  return `${"★".repeat(n)}${"☆".repeat(Math.max(0, 5 - n))}`;
}

function uniqueCount(list, keyFn) {
  return new Set(list.map(keyFn).filter(Boolean)).size;
}

function getDessert(id) {
  return desserts.find((dessert) => dessert.id === id);
}

function allowedOrKick(user) {
  return user?.email && ALLOWED_EMAILS.has(user.email.toLowerCase());
}

nodes.btnLogin.addEventListener("click", async () => {
  nodes.authMessage.textContent = "";
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    nodes.authMessage.textContent = `No se pudo iniciar sesión: ${error.message}`;
  }
});

nodes.btnLogout.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    stopListeners();
    showAuth();
    return;
  }

  if (!allowedOrKick(user)) {
    nodes.authMessage.textContent = `La cuenta ${user.email} no está autorizada para esta dulcería privada.`;
    await signOut(auth);
    return;
  }

  currentUser = user;
  showApp(user);
  startListeners();
});

function showAuth() {
  nodes.authScreen.classList.remove("hidden");
  nodes.appShell.classList.add("hidden");
}

function showApp(user) {
  nodes.authScreen.classList.add("hidden");
  nodes.appShell.classList.remove("hidden");
  nodes.userAvatar.src = user.photoURL || "https://www.gstatic.com/images/branding/product/1x/avatar_circle_blue_512dp.png";
  nodes.userName.textContent = user.displayName || "Morchis";
  nodes.userEmail.textContent = user.email;
  nodes.btnImportLocal.classList.toggle("hidden", !hasLocalLegacyData());
}

function startListeners() {
  stopListeners();
  unsubDesserts = onSnapshot(
    query(collection(db, "desserts"), orderBy("nameLower", "asc")),
    (snap) => {
      desserts = snap.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => !item.archived);
      renderAll();
    },
    (error) => toast(`Error cargando postres: ${error.message}`)
  );

  unsubLogs = onSnapshot(
    query(collection(db, "dessertLogs"), orderBy("eatenAt", "desc")),
    (snap) => {
      logs = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAll();
    },
    (error) => toast(`Error cargando historial: ${error.message}`)
  );
}

function stopListeners() {
  if (unsubDesserts) unsubDesserts();
  if (unsubLogs) unsubLogs();
  unsubDesserts = null;
  unsubLogs = null;
  desserts = [];
  logs = [];
}

function renderAll() {
  renderDashboard();
  renderDesserts();
  renderHistory();
  renderSuggestionResults();
  if (!activeSuggestion) setHeroSuggestion(generateSuggestions({ silent: true })[0] || null);
}

function renderDashboard() {
  const tried = desserts.filter((d) => d.status === "tried").length;
  const wishlist = desserts.filter((d) => d.status === "wishlist").length;
  const totalLogs = logs.length;
  const uniqueDesserts = uniqueCount(logs, (log) => log.dessertId);
  const variety = totalLogs ? Math.round((uniqueDesserts / totalLogs) * 100) : 0;
  const top = [...desserts].sort((a, b) => (b.timesEaten || 0) - (a.timesEaten || 0))[0];
  const last = logs[0];

  nodes.statsGrid.innerHTML = [
    statCard("🍰", "Postres", desserts.length, `${tried} probados · ${wishlist} pendientes`),
    statCard("🧾", "Registros", totalLogs, last ? `Último: ${formatDate(last.eatenAt)}` : "Aún no hay bitácora"),
    statCard("🎲", "Variedad", `${variety}%`, "Únicos frente al total comido"),
    statCard("🏆", "Más repetido", top ? escapeHTML(top.name) : "—", top ? `${top.timesEaten || 0} veces` : "Todavía nada, qué suspenso"),
  ].join("");

  renderRotationInsights(variety);
  renderWishlistPreview();
  renderRecentLogs();
}

function statCard(emoji, label, value, detail) {
  return `<article class="stat-card" data-emoji="${emoji}">
    <span>${label}</span>
    <strong>${value}</strong>
    <p>${detail}</p>
  </article>`;
}

function renderRotationInsights(variety) {
  const lastFive = logs.slice(0, 5);
  const lastDessertRepeated = lastFive.length >= 2 && lastFive[0].dessertId === lastFive[1].dessertId;
  const categoryCounts = lastFive.reduce((acc, log) => {
    acc[log.category || "Sin categoría"] = (acc[log.category || "Sin categoría"] || 0) + 1;
    return acc;
  }, {});
  const repeatedCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

  let risk = "Bajo";
  let riskClass = "green";
  if (lastDessertRepeated || variety < 45) { risk = "Alto"; riskClass = "red"; }
  else if (variety < 65 || (repeatedCategory && repeatedCategory[1] >= 3)) { risk = "Medio"; riskClass = "yellow"; }

  if (!logs.length) {
    nodes.riskBadge.className = "badge";
    nodes.riskBadge.textContent = "Sin datos";
  } else {
    nodes.riskBadge.className = `badge ${riskClass}`;
    nodes.riskBadge.textContent = `Riesgo ${risk}`;
  }

  const mostRecent = logs[0];
  const oldestWishlist = desserts
    .filter((d) => d.status === "wishlist")
    .sort((a, b) => (dateFromFirestore(a.createdAt)?.getTime() || 0) - (dateFromFirestore(b.createdAt)?.getTime() || 0))[0];

  const insights = [];
  if (!logs.length) insights.push(["🍽️", "Sin historial todavía", "Cuando registren consumos, aquí aparecerá el diagnóstico de repetición."]);
  if (lastDessertRepeated) insights.push(["🚨", "Repitieron el mismo postre seguido", "No es delito, pero la estadística ya está levantando una ceja."]);
  if (repeatedCategory && repeatedCategory[1] >= 3) insights.push(["♻️", "Categoría muy frecuente", `${escapeHTML(repeatedCategory[0])} apareció ${repeatedCategory[1]} veces en los últimos 5 registros.`]);
  if (mostRecent) insights.push(["🕰️", "Último antojo", `${escapeHTML(mostRecent.dessertName)} el ${formatDate(mostRecent.eatenAt)}.`]);
  if (oldestWishlist) insights.push(["📌", "Pendiente antiguo", `${escapeHTML(oldestWishlist.name)} sigue esperando su gran debut dramático.`]);
  if (!insights.length) insights.push(["✅", "Rotación sana", "No se ve una repetición intensa. Milagro: datos usados para comer mejor."]);

  nodes.rotationInsights.innerHTML = insights.slice(0, 4).map(([icon, title, text]) => `
    <div class="insight"><strong>${icon}</strong><div><b>${title}</b><span>${text}</span></div></div>
  `).join("");
}

function renderWishlistPreview() {
  const pending = desserts
    .filter((d) => d.status === "wishlist")
    .sort((a, b) => (dateFromFirestore(a.createdAt)?.getTime() || 0) - (dateFromFirestore(b.createdAt)?.getTime() || 0))
    .slice(0, 5);

  if (!pending.length) {
    nodes.wishlistPreview.innerHTML = emptyState("No hay postres pendientes", "Agreguen ideas para que el sugeridor no tenga que improvisar con aire y azúcar.");
    return;
  }

  nodes.wishlistPreview.innerHTML = pending.map((d) => `
    <div class="mini-item">
      <div><strong>${escapeHTML(d.name)}</strong><small>${escapeHTML(d.category || "Sin categoría")} · ${chipText(d)}</small></div>
      <button class="btn btn-ghost" data-action="eat" data-id="${d.id}">Comer</button>
    </div>
  `).join("");
}

function renderRecentLogs() {
  const recent = logs.slice(0, 6);
  nodes.recentLogs.innerHTML = recent.length ? recent.map(logItem).join("") : emptyState("Aún no han registrado consumos", "Cuando coman algo, guárdenlo. Sí, hasta el postrecito pequeño cuenta. La auditoría dulce no perdona.");
}

function renderDesserts() {
  const search = normalize(nodes.searchInput.value);
  const filter = nodes.filterSelect.value;
  let visible = [...desserts];

  if (filter === "wishlist") visible = visible.filter((d) => d.status === "wishlist");
  if (filter === "tried") visible = visible.filter((d) => d.status === "tried");
  if (filter === "recent") visible = visible.filter((d) => daysSince(d.lastEaten) <= 14);
  if (filter === "forgotten") visible = visible.filter((d) => d.status === "tried" && daysSince(d.lastEaten) >= 30);

  if (search) {
    visible = visible.filter((d) => [
      d.name,
      d.category,
      d.notes,
      d.place,
      ...(d.tags || []),
    ].some((value) => normalize(value).includes(search)));
  }

  visible.sort((a, b) => {
    if (a.status !== b.status) return a.status === "wishlist" ? -1 : 1;
    return (b.timesEaten || 0) - (a.timesEaten || 0) || a.name.localeCompare(b.name);
  });

  nodes.dessertGrid.innerHTML = visible.length
    ? visible.map(dessertCard).join("")
    : emptyState("No encontré postres con ese filtro", "El vacío también es un resultado, aunque no quite el antojo.");
}

function dessertCard(d) {
  const last = d.lastEaten ? `Última vez: ${formatDate(d.lastEaten)} · hace ${daysSince(d.lastEaten)} días` : "Nunca registrado como comido";
  const tags = (d.tags || []).slice(0, 4).map((tag) => `<span class="chip">#${escapeHTML(tag)}</span>`).join("");
  const badge = d.status === "wishlist"
    ? `<span class="badge yellow">Por probar</span>`
    : `<span class="badge green">Probado</span>`;

  return `<article class="dessert-card">
    <div class="dessert-card-head">
      <div>
        <h4>${escapeHTML(d.name)}</h4>
        <div class="meta-line">${escapeHTML(d.category || "Sin categoría")}</div>
      </div>
      ${badge}
    </div>
    <div class="stars">${stars(d.rating)}</div>
    <div class="chips">
      <span class="chip">${escapeHTML(d.texture || "textura")}</span>
      <span class="chip">dulce ${escapeHTML(d.sweetness || "medio")}</span>
      ${tags}
    </div>
    <p class="card-note">${escapeHTML(d.notes || "Sin notas. Misterioso, como postre de vitrina sin precio.")}</p>
    <div class="meta-line">${last} · ${d.timesEaten || 0} veces</div>
    <div class="card-actions">
      <button class="btn btn-primary" data-action="eat" data-id="${d.id}">Lo comimos</button>
      <button class="btn btn-ghost" data-action="edit" data-id="${d.id}">Editar</button>
    </div>
  </article>`;
}

function renderHistory() {
  const range = nodes.historyRangeSelect.value;
  let visible = [...logs];
  if (range !== "all") {
    const days = Number(range);
    visible = visible.filter((log) => daysSince(log.eatenAt) <= days);
  }

  nodes.historyTimeline.innerHTML = visible.length
    ? visible.map(logItem).join("")
    : emptyState("No hay registros en este rango", "La memoria humana falla, por eso existe esta cosa con botones.");
}

function logItem(log) {
  const note = log.notes ? ` · ${escapeHTML(log.notes)}` : "";
  const by = log.eatenBy ? ` · ${escapeHTML(log.eatenBy)}` : "";
  return `<article class="timeline-item">
    <div class="timeline-icon">${emojiForCategory(log.category)}</div>
    <div>
      <h4>${escapeHTML(log.dessertName || "Postre sin nombre")}</h4>
      <p>${escapeHTML(log.category || "Sin categoría")}${by} · ${stars(log.rating || 0)}${note}</p>
    </div>
    <time>${formatDate(log.eatenAt)}</time>
  </article>`;
}

function emojiForCategory(category = "") {
  if (category.includes("Helado")) return "🍦";
  if (category.includes("Galleta")) return "🍪";
  if (category.includes("Chocolate") || category.includes("Brownie")) return "🍫";
  if (category.includes("Masa") || category.includes("Hojaldre") || category.includes("Panadería")) return "🥐";
  if (category.includes("Crema") || category.includes("Flan")) return "🍮";
  if (category.includes("Frutal")) return "🍓";
  return "🍰";
}

function chipText(d) {
  const bits = [d.texture, d.sweetness && `dulce ${d.sweetness}`].filter(Boolean);
  return bits.join(" · ") || "sin detalles";
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${title}</strong><span>${text}</span></div>`;
}

function generateSuggestions({ silent = false } = {}) {
  const craving = nodes.cravingSelect?.value || "any";
  const avoidDays = Number(nodes.avoidDaysSelect?.value || 21);
  const mode = nodes.modeSelect?.value || "balanced";
  const recentIds = new Set(logs.filter((log) => daysSince(log.eatenAt) <= avoidDays).map((log) => log.dessertId));
  const recentCategories = logs.filter((log) => daysSince(log.eatenAt) <= Math.min(avoidDays, 21)).map((log) => log.category);

  let pool = desserts.filter((d) => !recentIds.has(d.id));
  if (!pool.length) pool = [...desserts];

  const scored = pool.map((d) => {
    let score = 20;
    const reasons = [];
    const lastDays = daysSince(d.lastEaten);
    const rating = Number(d.rating || 0);
    const times = Number(d.timesEaten || 0);
    const tags = [d.category, d.texture, d.sweetness, ...(d.tags || [])].map(normalize).join(" ");

    if (d.status === "wishlist") { score += 42; reasons.push("Está en la lista de pendientes."); }
    if (times === 0) { score += 24; reasons.push("Nunca lo han registrado como comido."); }
    if (lastDays >= 30 && lastDays < 9999) { score += 22; reasons.push(`No sale hace ${lastDays} días.`); }
    if (lastDays >= 7 && lastDays < 30) score += lastDays * 0.7;
    if (rating >= 4) { score += rating * 5; reasons.push("Tiene buena calificación."); }
    if (times > 3) score -= Math.min(18, times * 1.8);
    if (recentCategories.includes(d.category)) { score -= 12; reasons.push("Misma categoría reciente, pero todavía compite."); }

    if (mode === "wishlist" && d.status === "wishlist") score += 28;
    if (mode === "favorites" && rating >= 4) score += 25;
    if (mode === "forgotten" && lastDays >= 30) score += 30;

    if (craving !== "any") {
      const match = cravingMatches(craving, tags);
      if (match) { score += 30; reasons.push(`Encaja con el antojo: ${craving}.`); }
      else score -= 18;
    }

    score += Math.random() * 12;
    if (!reasons.length) reasons.push("Buena opción para variar sin pensar demasiado, que ya es bastante logro.");
    if (recentIds.has(d.id)) reasons.push(`Ojo: apareció dentro de los últimos ${avoidDays} días.`);
    return { dessert: d, score: Math.max(1, Math.round(score)), reasons: reasons.slice(0, 4) };
  }).sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 3);
  if (!silent) {
    if (!top.length) toast("Agreguen postres primero. El sugeridor todavía no cocina milagros.");
    else toast("Sugerencias generadas sin sacrificar una galleta al algoritmo.");
  }
  return top;
}

function cravingMatches(craving, text) {
  const map = {
    chocolate: ["chocolate", "brownie", "cacao", "milo", "nutella"],
    cremoso: ["cremoso", "crema", "flan", "cheesecake", "tres leches", "suave"],
    frio: ["frio", "helado", "gelato", "malteada", "frappe"],
    frutal: ["frutal", "fruta", "fresa", "mora", "limon", "maracuya", "mango", "banano"],
    masa: ["masa", "hojaldre", "panaderia", "croissant", "waffle", "pancake", "galleta"],
    ligero: ["ligero", "suave", "fruta", "gelatina"],
  };
  return (map[craving] || []).some((word) => text.includes(word));
}

function renderSuggestionResults() {
  if (activeTab !== "suggestions") return;
  const results = generateSuggestions({ silent: true });
  nodes.suggestionResults.innerHTML = results.length
    ? results.map(suggestionCard).join("")
    : emptyState("No hay sugerencias todavía", "Agreguen postres al catálogo. El algoritmo no puede recomendar el vacío, aunque el vacío combina con café.");
}

function suggestionCard(result, index) {
  const d = result.dessert;
  const width = Math.min(100, Math.max(8, result.score));
  return `<article class="suggestion-card">
    <span class="badge ${index === 0 ? "green" : "soft"}">${index === 0 ? "Mejor opción" : `Opción ${index + 1}`}</span>
    <h4>${escapeHTML(d.name)}</h4>
    <p class="meta-line">${escapeHTML(d.category || "Sin categoría")} · ${chipText(d)}</p>
    <div class="score-bar"><span style="width:${width}%"></span></div>
    <ul class="reason-list">${result.reasons.map((reason) => `<li>${escapeHTML(reason)}</li>`).join("")}</ul>
    <div class="card-actions">
      <button class="btn btn-primary" data-action="eat" data-id="${d.id}">Elegir y registrar</button>
      <button class="btn btn-ghost" data-action="pin-suggestion" data-id="${d.id}">Poner arriba</button>
    </div>
  </article>`;
}

function setHeroSuggestion(result) {
  activeSuggestion = result;
  if (!result) {
    nodes.todaySuggestionName.textContent = "Aún no hay sugerencia";
    nodes.todaySuggestionReason.textContent = "Agreguen postres o usen el sugeridor para evitar repetir como NPC con hambre.";
    nodes.btnEatSuggestion.disabled = true;
    return;
  }
  const d = result.dessert;
  nodes.todaySuggestionName.textContent = d.name;
  nodes.todaySuggestionReason.textContent = result.reasons[0] || "Buena opción para variar.";
  nodes.btnEatSuggestion.disabled = false;
}

function openDessertModal(id = null) {
  editingDessertId = id;
  const d = id ? getDessert(id) : null;
  nodes.dessertModalTitle.textContent = d ? "Editar postre" : "Nuevo postre";
  nodes.btnDeleteDessert.classList.toggle("hidden", !d);

  $("dessertName").value = d?.name || "";
  $("dessertCategory").value = d?.category || "🎂 Torta";
  $("dessertStatus").value = d?.status || "wishlist";
  $("dessertRating").value = d?.rating ?? 3;
  $("dessertTexture").value = d?.texture || "cremoso";
  $("dessertSweetness").value = d?.sweetness || "medio";
  $("dessertPlace").value = d?.place || "";
  $("dessertTags").value = (d?.tags || []).join(", ");
  $("dessertNotes").value = d?.notes || "";

  nodes.dessertModal.classList.remove("hidden");
  setTimeout(() => $("dessertName").focus(), 40);
}

function closeDessertModal() {
  nodes.dessertModal.classList.add("hidden");
  editingDessertId = null;
  nodes.dessertForm.reset();
}

async function saveDessert(event) {
  event.preventDefault();
  const name = $("dessertName").value.trim();
  if (!name) return toast("Ponle nombre al postre. No somos salvajes, por ahora.");

  const payload = {
    name,
    nameLower: normalize(name),
    category: $("dessertCategory").value,
    status: $("dessertStatus").value,
    rating: Number($("dessertRating").value || 0),
    texture: $("dessertTexture").value,
    sweetness: $("dessertSweetness").value,
    place: $("dessertPlace").value.trim(),
    tags: parseTags($("dessertTags").value),
    notes: $("dessertNotes").value.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.email,
  };

  try {
    if (editingDessertId) {
      await updateDoc(doc(db, "desserts", editingDessertId), payload);
      toast("Postre actualizado.");
    } else {
      await addDoc(collection(db, "desserts"), {
        ...payload,
        timesEaten: 0,
        lastEaten: null,
        archived: false,
        createdAt: serverTimestamp(),
        createdBy: currentUser.email,
      });
      toast("Postre agregado.");
    }
    closeDessertModal();
  } catch (error) {
    toast(`No se pudo guardar: ${error.message}`);
  }
}

function openEatModal(id) {
  const d = getDessert(id);
  if (!d) return;
  eatingDessertId = id;
  nodes.eatModalTitle.textContent = `Registrar: ${d.name}`;
  nodes.eatDate.value = todayISO();
  nodes.eatBy.value = currentUser.email?.startsWith("catalina") ? "Cata" : "Alek";
  nodes.eatRating.value = d.rating || 4;
  nodes.eatNotes.value = "";
  nodes.eatModal.classList.remove("hidden");
}

function closeEatModal() {
  nodes.eatModal.classList.add("hidden");
  eatingDessertId = null;
  nodes.eatForm.reset();
}

async function saveEatLog(event) {
  event.preventDefault();
  const d = getDessert(eatingDessertId);
  if (!d) return;

  const dateValue = nodes.eatDate.value || todayISO();
  const eatenAt = Timestamp.fromDate(new Date(`${dateValue}T12:00:00`));
  const rating = Number(nodes.eatRating.value || 0);
  const eatenBy = nodes.eatBy.value;
  const notes = nodes.eatNotes.value.trim();

  try {
    await addDoc(collection(db, "dessertLogs"), {
      dessertId: d.id,
      dessertName: d.name,
      category: d.category || "",
      eatenAt,
      eatenDate: dateValue,
      eatenBy,
      rating,
      notes,
      createdAt: serverTimestamp(),
      createdBy: currentUser.email,
    });

    await updateDoc(doc(db, "desserts", d.id), {
      status: "tried",
      timesEaten: increment(1),
      lastEaten: eatenAt,
      rating: rating || d.rating || 0,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.email,
    });

    closeEatModal();
    toast("Consumo registrado. La historia dulce queda documentada.");
  } catch (error) {
    toast(`No se pudo registrar: ${error.message}`);
  }
}

async function removeDessert() {
  if (!editingDessertId) return;
  const d = getDessert(editingDessertId);
  if (!confirm(`¿Eliminar "${d?.name || "este postre"}"? El historial pasado se conserva.`)) return;
  try {
    await deleteDoc(doc(db, "desserts", editingDessertId));
    closeDessertModal();
    toast("Postre eliminado del catálogo.");
  } catch (error) {
    toast(`No se pudo eliminar: ${error.message}`);
  }
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  $(`${tab}Tab`).classList.add("active");
  if (tab === "suggestions") renderSuggestionResults();
}

function hasLocalLegacyData() {
  try {
    const raw = localStorage.getItem("postres_v1");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

async function importLegacyData() {
  let legacy = [];
  try { legacy = JSON.parse(localStorage.getItem("postres_v1") || "[]"); }
  catch { legacy = []; }
  if (!legacy.length) return toast("No encontré datos locales para importar.");
  if (!confirm(`Voy a importar ${legacy.length} postres del localStorage a Firebase. ¿Seguimos?`)) return;

  try {
    for (const item of legacy) {
      const name = item.name || item.nombre || "Postre sin nombre";
      const lastMadeDate = item.lastMade ? Timestamp.fromDate(new Date(`${item.lastMade}T12:00:00`)) : null;
      const docRef = await addDoc(collection(db, "desserts"), {
        name,
        nameLower: normalize(name),
        category: item.categoria || item.category || "🍰 Otro",
        status: item.status || "wishlist",
        rating: Number(item.rating || 0),
        texture: "suave",
        sweetness: "medio",
        place: "Importado del proyecto anterior",
        tags: [],
        notes: item.notes || "",
        timesEaten: Number(item.timesMade || 0),
        lastEaten: lastMadeDate,
        archived: false,
        createdAt: serverTimestamp(),
        createdBy: currentUser.email,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.email,
      });

      if (lastMadeDate && Number(item.timesMade || 0) > 0) {
        await addDoc(collection(db, "dessertLogs"), {
          dessertId: docRef.id,
          dessertName: name,
          category: item.categoria || item.category || "🍰 Otro",
          eatenAt: lastMadeDate,
          eatenDate: item.lastMade,
          eatenBy: "Importado",
          rating: Number(item.rating || 0),
          notes: "Registro importado desde la versión anterior.",
          createdAt: serverTimestamp(),
          createdBy: currentUser.email,
        });
      }
    }
    localStorage.removeItem("postres_v1");
    nodes.btnImportLocal.classList.add("hidden");
    toast("Importación lista. El pasado azucarado sobrevivió.");
  } catch (error) {
    toast(`No se pudo importar: ${error.message}`);
  }
}

nodes.dessertForm.addEventListener("submit", saveDessert);
nodes.eatForm.addEventListener("submit", saveEatLog);
nodes.searchInput.addEventListener("input", renderDesserts);
nodes.filterSelect.addEventListener("change", renderDesserts);
nodes.historyRangeSelect.addEventListener("change", renderHistory);
nodes.cravingSelect.addEventListener("change", renderSuggestionResults);
nodes.avoidDaysSelect.addEventListener("change", renderSuggestionResults);
nodes.modeSelect.addEventListener("change", renderSuggestionResults);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDessertModal();
    closeEatModal();
  }
});

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const { action, id, tab, filter } = target.dataset;

  if (tab) {
    switchTab(tab);
    if (filter) nodes.filterSelect.value = filter;
    renderDesserts();
    return;
  }

  if (action === "open-dessert") openDessertModal();
  if (action === "close-modal") closeDessertModal();
  if (action === "close-eat-modal") closeEatModal();
  if (action === "edit") openDessertModal(id);
  if (action === "eat") openEatModal(id);
  if (action === "delete-dessert") removeDessert();
  if (action === "suggest-now") setHeroSuggestion(generateSuggestions()[0] || null);
  if (action === "generate-suggestions") {
    activeTab = "suggestions";
    switchTab("suggestions");
    renderSuggestionResults();
  }
  if (action === "pin-suggestion") {
    const d = getDessert(id);
    if (d) setHeroSuggestion({ dessert: d, reasons: ["Elegido manualmente desde el sugeridor."], score: 100 });
  }
  if (action === "eat-suggestion" && activeSuggestion) openEatModal(activeSuggestion.dessert.id);
  if (action === "import-local") importLegacyData();
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      if (backdrop.id === "dessertModal") closeDessertModal();
      if (backdrop.id === "eatModal") closeEatModal();
    }
  });
});

fieldIds.forEach((id) => {
  const node = $(id);
  if (node) node.autocomplete = "off";
});
