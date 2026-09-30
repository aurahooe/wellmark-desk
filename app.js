const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
const $ = (sel) => document.querySelector(sel);
const views = { desk: $("#view-desk"), board: $("#view-board"), studio: $("#view-studio") };
let session = null;
let profile = null;

function show(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
}

document.querySelectorAll("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => show(btn.dataset.go));
});

function tick() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
tick();
setInterval(tick, 15000);

function renderEdition(row) {
  if (!row) {
    $("#ed-kicker").textContent = "Quiet hour";
    $("#ed-headline").textContent = "Nothing filed yet.";
    $("#ed-body").textContent = "The next reprint lands on the hour.";
    $("#ed-meta").textContent = "";
    return;
  }
  $("#ed-kicker").textContent = row.kicker || "This hour";
  $("#ed-headline").textContent = row.headline;
  $("#ed-body").textContent = row.body;
  $("#ed-meta").textContent = row.hour_key.replace("T", " · ") + " UTC";
}

async function loadHours() {
  const { data } = await sb.from("wellmark_hours").select("*").order("created_at", { ascending: false }).limit(12);
  const rows = data || [];
  renderEdition(rows[0]);
  const list = $("#hour-list");
  list.innerHTML = "";
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.style.animationDelay = `${i * 40}ms`;
    li.innerHTML = `<button type="button"><strong>${row.headline}</strong><span>${row.hour_key}</span></button>`;
    li.querySelector("button").addEventListener("click", () => renderEdition(row));
    list.appendChild(li);
  });
}

function markCard(row, mine = false) {
  const el = document.createElement("article");
  el.className = "card";
  el.innerHTML = `
    <h3></h3>
    <p class="who"></p>
    <p class="body"></p>
    ${mine ? `<div class="actions"><button data-pub>${row.is_public ? "Make private" : "Make public"}</button><button data-del>Delete</button></div>` : ""}
  `;
  el.querySelector("h3").textContent = row.title;
  el.querySelector(".who").textContent = (row.is_public ? "Public" : "Private") + " · " + new Date(row.created_at).toLocaleString();
  el.querySelector(".body").textContent = row.body;
  if (mine) {
    el.querySelector("[data-pub]").addEventListener("click", async () => {
      await sb.from("wellmark_marks").update({ is_public: !row.is_public, updated_at: new Date().toISOString() }).eq("id", row.id);
      await Promise.all([loadMine(), loadPublic()]);
    });
    el.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm("Delete this mark?")) return;
      await sb.from("wellmark_marks").delete().eq("id", row.id);
      await Promise.all([loadMine(), loadPublic()]);
    });
  }
  return el;
}

async function loadPublic() {
  const { data } = await sb.from("wellmark_marks").select("id,title,body,is_public,created_at,author_id").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
  const box = $("#public-marks");
  box.innerHTML = "";
  (data || []).forEach((row) => box.appendChild(markCard(row)));
  if (!data || !data.length) {
    box.innerHTML = "<p class='hint'>No public marks yet. Sign in and leave one on the desk.</p>";
  }
}

async function loadMine() {
  if (!session) return;
  const { data } = await sb.from("wellmark_marks").select("*").eq("author_id", session.user.id).order("created_at", { ascending: false });
  const box = $("#my-marks");
  box.innerHTML = "";
  (data || []).forEach((row) => box.appendChild(markCard(row, true)));
}

async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  const btn = $("#auth-btn");
  const studioBtn = document.querySelector('[data-go="studio"]');
  if (session) {
    btn.textContent = "Sign out";
    studioBtn.classList.remove("hidden");
    const { data: prof } = await sb.from("wellmark_profiles").select("*").eq("id", session.user.id).maybeSingle();
    profile = prof;
    $("#studio-who").textContent = profile ? `${profile.display_name} · @${profile.handle}` : session.user.email;
    await loadMine();
  } else {
    btn.textContent = "Sign in";
    studioBtn.classList.add("hidden");
    if (!views.studio.classList.contains("hidden")) show("desk");
  }
}

$("#auth-btn").addEventListener("click", async () => {
  if (session) {
    await sb.auth.signOut();
    await refreshAuth();
    return;
  }
  $("#auth-msg").textContent = "";
  $("#auth-dialog").showModal();
});

$("#auth-close").addEventListener("click", () => $("#auth-dialog").close());

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = new FormData(e.target).get("email");
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  $("#auth-msg").textContent = error ? error.message : "Link sent. Check your inbox.";
});

$("#mark-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  const fd = new FormData(e.target);
  const payload = {
    author_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
  };
  const { error } = await sb.from("wellmark_marks").insert(payload);
  if (error) { alert(error.message); return; }
  e.target.reset();
  await Promise.all([loadMine(), loadPublic()]);
});

sb.auth.onAuthStateChange(() => { refreshAuth(); });
loadHours();
loadPublic();
refreshAuth();
