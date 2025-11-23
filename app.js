/* app.js - single shared JS for all pages */

/*
  IMPORTANT:
  - Set API_BASE to your backend base URL, e.g. "https://api.myblog.app"
  - Endpoints expected:
      POST  /register
      POST  /login      -> returns { token: "..." }
      GET   /posts
      GET   /posts/:id
      POST  /posts      (Authorization: Bearer <token>)
      PUT   /posts/:id
      DELETE /posts/:id
*/

const API_BASE = "./api"; // <<-- replace with real API base if needed

/* --- Auth helpers --- */
const tokenKey = "jwt_token";
function saveToken(t){ localStorage.setItem(tokenKey, t); }
function getToken(){ return localStorage.getItem(tokenKey); }
function removeToken(){ localStorage.removeItem(tokenKey); }
function authHeader(){ const t = getToken(); return t ? { "Authorization": "Bearer " + t } : {}; }

/* --- generic fetch wrapper --- */
async function apiFetch(path, opts = {}) {
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  if (!opts.noAuth && !headers.Authorization) {
    Object.assign(headers, authHeader());
  }
  const res = await fetch(API_BASE + path, {...opts, headers});
  if (res.status === 401) {
    // unauthorized -> redirect to login page
    if (window.location.pathname !== "login.html") window.location.href = "401.html";
    throw new Error("401 Unauthorized");
  }
  if (res.status === 403) {
    if (window.location.pathname !== "403.html") window.location.href = "403.html";
    throw new Error("403 Forbidden");
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return text; }
}

/* --- UI helpers --- */
function showToast(msg) {
  // simple toast via alert for now
  alert(msg);
}

/* --- Page-specific helpers --- */

/* Home page: list posts in .posts-list */
async function home_init(){
  const listEl = document.getElementById("posts-list");
  if(!listEl) return;
  try {
    const posts = await apiFetch("/posts", { method:"GET", noAuth:true });
    listEl.innerHTML = posts.map(p => `
      <div class="card">
        <h3><a href="/post.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.title)}</a></h3>
        <div class="meta">${new Date(p.created_at || p.createdAt || Date.now()).toLocaleString()} • <span class="tag">${p.category||'Uncategorized'}</span></div>
        <div class="excerpt">${escapeHtml(p.excerpt || (p.content||'').slice(0,200)+'...')}</div>
        <div><a href="post.html?id=${encodeURIComponent(p.id)}" class="">Read more →</a></div>
      </div>
    `).join("");
  } catch(err){
    listEl.innerHTML = `<div class="card"><p class="muted">Gagal memuat post: ${err.message}</p></div>`;
  }
}

/* Post detail page */
async function post_init(){
  const el = document.getElementById("post-root");
  if(!el) return;
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if(!id){ el.innerHTML = `<div class="card"><p class="muted">ID artikel tidak ditemukan.</p></div>`; return; }

  try {
    const p = await apiFetch(`/posts/${encodeURIComponent(id)}`, { method:"GET", noAuth:true });
    el.innerHTML = `
      <div class="card">
        <h2>${escapeHtml(p.title)}</h2>
        <div class="meta">${new Date(p.created_at || p.createdAt || Date.now()).toLocaleString()} • <span class="tag">${p.category||'Uncategorized'}</span></div>
        <div style="margin-top:12px;">${nl2br(escapeHtml(p.content || ''))}</div>
        ${canEditButtons(p) ? `
          <div style="margin-top:14px;">
            <a href="edit.html?id=${encodeURIComponent(p.id)}" class="btn">Edit</a>
            <button class="btn ghost" id="delete-post-btn">Delete</button>
          </div>
        ` : ''}
      </div>
    `;
    const delBtn = document.getElementById("delete-post-btn");
    if(delBtn) delBtn.addEventListener("click", async ()=>{
      if(!confirm("Hapus post ini? Tindakan ini tidak bisa dibatalkan.")) return;
      try {
        await apiFetch(`/posts/${encodeURIComponent(id)}`, { method:"DELETE" });
        showToast("Post berhasil dihapus");
        window.location.href = "/";
      } catch(err){ showToast("Gagal menghapus: " + err.message); }
    });
  } catch(err){
    el.innerHTML = `<div class="card"><p class="muted">Gagal memuat artikel: ${err.message}</p></div>`;
  }
}

/* Login page */
async function login_init(){
  const form = document.getElementById("login-form");
  if(!form) return;
  form.addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const fm = new FormData(form);
    const payload = { email: fm.get("email"), password: fm.get("password") };
    try {
      const res = await apiFetch("login", { method:"POST", body: JSON.stringify(payload), noAuth:true });
      if(res.token){
        saveToken(res.token);
        showToast("Login berhasil");
        window.location.href = "dashboard.html";
      } else showToast("Response tidak mengandung token");
    } catch(err){ showToast("Login gagal: " + err.message); }
  });
}

/* Register page */
async function register_init(){
  const form = document.getElementById("register-form");
  if(!form) return;
  form.addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const fm = new FormData(form);
    const payload = { name: fm.get("name"), email: fm.get("email"), password: fm.get("password") };
    try {
      const res = await apiFetch("register", { method:"POST", body: JSON.stringify(payload), noAuth:true });
      showToast("Registrasi berhasil. Silakan login.");
      window.location.href = "login.html";
    } catch(err){ showToast("Registrasi gagal: " + err.message); }
  });
}

/* Dashboard listing user's posts */
async function dashboard_init(){
  const root = document.getElementById("dashboard-root");
  if(!root) return;
  const token = getToken();
  if(!token) { window.location.href = "login.html"; return; }
  try {
    const posts = await apiFetch("/posts", { method:"GET" }); // assume backend filters by owner when token provided
    root.innerHTML = posts.map(p => `
      <div class="post-row">
        <div>
          <strong>${escapeHtml(p.title)}</strong><div class="muted">${new Date(p.created_at||Date.now()).toLocaleString()}</div>
        </div>
        <div>
          <a class="btn ghost" href="edit.html?id=${encodeURIComponent(p.id)}">Edit</a>
          <button class="btn" data-delete="${encodeURIComponent(p.id)}">Delete</button>
        </div>
      </div>
    `).join("");
    // attach delete handlers
    root.querySelectorAll("button[data-delete]").forEach(btn=>{
      btn.addEventListener("click", async ()=> {
        const id = decodeURIComponent(btn.getAttribute("data-delete"));
        if(!confirm("Yakin ingin menghapus?")) return;
        try {
          await apiFetch(`/posts/${encodeURIComponent(id)}`, { method:"DELETE" });
          showToast("Terhapus");
          dashboard_init(); // refresh
        } catch(err){ showToast("Gagal: " + err.message); }
      });
    });
  } catch(err){
    root.innerHTML = `<div class="card"><p class="muted">Gagal memuat dashboard: ${err.message}</p></div>`;
  }
}

/* Create post page */
async function create_init(){
  const form = document.getElementById("create-form");
  if(!form) return;
  if(!getToken()){ window.location.href = "login.html"; return; }
  form.addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const fm = new FormData(form);
    const payload = { title: fm.get("title"), content: fm.get("content"), category: fm.get("category"), excerpt: fm.get("excerpt") };
    try {
      await apiFetch("/posts", { method:"POST", body: JSON.stringify(payload) });
      showToast("Post dibuat");
      window.location.href = "dashboard.html";
    } catch(err){ showToast("Gagal membuat post: " + err.message); }
  });
}

/* Edit post page */
async function edit_init(){
  const form = document.getElementById("edit-form");
  if(!form) return;
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if(!id) { showToast("ID tidak ditemukan"); return; }
  try {
    const p = await apiFetch(`/posts/${encodeURIComponent(id)}`, { method:"GET" });
    form.elements.title.value = p.title || "";
    form.elements.content.value = p.content || "";
    form.elements.category.value = p.category || "";
    form.elements.excerpt.value = p.excerpt || "";
  } catch(err){ showToast("Gagal memuat post: " + err.message); }

  form.addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const fm = new FormData(form);
    const payload = { title: fm.get("title"), content: fm.get("content"), category: fm.get("category"), excerpt: fm.get("excerpt") };
    try {
      await apiFetch(`/posts/${encodeURIComponent(id)}`, { method:"PUT", body: JSON.stringify(payload) });
      showToast("Berhasil update");
      window.location.href = "dashboard.html";
    } catch(err){ showToast("Gagal update: " + err.message); }
  });
}

/* Simple utility functions */
function escapeHtml(str){
  if(!str) return "";
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[s]);
}
function nl2br(str){ return escapeHtml(str).replace(/\n/g, "<br/>"); }
function canEditButtons(post){
  // naive: if backend returned "is_owner" or compare with decoded token
  return post && (post.is_owner || post.owner === getUserEmailFromToken());
}
function getUserEmailFromToken(){
  const t = getToken();
  if(!t) return null;
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    return payload.email || payload.sub || null;
  } catch(e){ return null; }
}

/* Nav auth UI */
function nav_init(){
  const el = document.getElementById("nav-auth");
  if(!el) return;
  const t = getToken();
  if(t){
    el.innerHTML = `<div class="auth-info"><span class="muted">Signed in</span> <a class="btn ghost" href="dashboard.html">Dashboard</a> <button id="logout-btn" class="btn">Logout</button></div>`;
    document.getElementById("logout-btn").addEventListener("click", ()=>{ removeToken(); window.location.href="/"; });
  } else {
    el.innerHTML = `<div class="auth-info"><a class="btn ghost" href="login.html">Login</a> <a class="btn" href="register.html">Register</a></div>`;
  }
}

async function categories_init(){
  const root = document.getElementById("categories-root");
  if(!root) return;

  try {
    // Fetch all categories
    const categories = await apiFetch("/categories", {
      method: "GET",
      noAuth: true
    });

    // Render category list
    root.innerHTML = `
      <div class="card">
        <h2>Kategori Artikel</h2>
        <p class="muted" style="margin-top:6px;">Pilih kategori untuk melihat daftar artikel terkait.</p>
        <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
          ${categories.map(cat => `
            <a class="tag" href="?cat=${encodeURIComponent(cat)}">${cat}</a>
          `).join("")}
        </div>
      </div>
    `;

    // If category selected in URL (?cat=xxx)
    const qs = new URLSearchParams(window.location.search);
    const selected = qs.get("cat");

    if(selected){
      const postSection = document.getElementById("category-posts");

      postSection.innerHTML = `
        <div class="card"><p class="muted">Memuat artikel kategori <strong>${selected}</strong>...</p></div>
      `;

      const posts = await apiFetch(`/posts?category=${encodeURIComponent(selected)}`, { noAuth:true });

      if(posts.length === 0){
        postSection.innerHTML = `
          <div class="card"><p class="muted">Tidak ada artikel dalam kategori ini.</p></div>
        `;
        return;
      }

      // Render post list
      postSection.innerHTML = posts.map(p => `
        <div class="card" style="margin-bottom:12px;">
          <h3><a href="/post.html?id=${p.id}">${p.title}</a></h3>
          <div class="meta">${p.category}</div>
          <p class="excerpt">${(p.excerpt || p.content.slice(0,150)) + "..."}</p>
        </div>
      `).join("");
    }

  } catch(err){
    root.innerHTML = `
      <div class="card"><p class="muted">Gagal memuat kategori: ${err.message}</p></div>
    `;
  }
}



/* ============================
   ARCHIVE PAGE
============================ */
async function archive_init(){
  const root = document.getElementById("archive-root");
  if(!root) return;

  try {
    // Expected format:
    // [ { year: 2024, months: [1,2,3] }, ... ]
    const archives = await apiFetch("/archive", { method:"GET", noAuth:true });

    root.innerHTML = `
      <div class="card">
        <h2>Arsip Artikel</h2>
        <p class="muted" style="margin-top:6px;">Pilih tahun dan bulan untuk melihat artikel.</p>

        <div style="margin-top:16px;">
          ${archives.map(a => `
            <div style="margin-bottom:14px;">
              <strong style="font-size:1.1rem">${a.year}</strong>
              <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
                ${a.months.map(m => `
                  <a class="tag" href="?year=${a.year}&month=${m}">${a.year}/${m}</a>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // Handle selected archive
    const qs = new URLSearchParams(window.location.search);
    const year = qs.get("year");
    const month = qs.get("month");

    if(year && month){
      const target = document.getElementById("archive-posts");

      target.innerHTML = `
        <div class="card"><p class="muted">Memuat arsip ${year}/${month}...</p></div>
      `;

      const posts = await apiFetch(`/posts?year=${year}&month=${month}`, { noAuth: true });

      if(posts.length === 0){
        target.innerHTML = `
          <div class="card"><p class="muted">Tidak ada artikel pada bulan ini.</p></div>
        `;
        return;
      }

      target.innerHTML = posts.map(p => `
        <div class="card" style="margin-bottom:12px;">
          <h3><a href="post.html?id=${p.id}">${p.title}</a></h3>
          <div class="meta">${new Date(p.created_at).toLocaleDateString()}</div>
        </div>
      `).join("");
    }

  } catch(err){
    root.innerHTML = `
      <div class="card"><p class="muted">Gagal memuat arsip: ${err.message}</p></div>
    `;
  }
}

/* ============================
   SEARCH PAGE
============================ */
async function search_init() {
  const form = document.getElementById("search-form");
  const results = document.getElementById("search-results");
  if (!form || !results) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const keyword = form.querySelector("input[name='keyword']").value.trim();
    if (!keyword) {
      results.innerHTML = `<div class="card"><p class="muted">Masukkan kata kunci pencarian.</p></div>`;
      return;
    }

    results.innerHTML = `<div class="card"><p class="muted">Mencari "${keyword}"...</p></div>`;

    try {
      const posts = await apiFetch(`/posts?search=${encodeURIComponent(keyword)}`, { noAuth: true });
      if (!posts || posts.length === 0) {
        results.innerHTML = `<div class="card"><p class="muted">Tidak ada hasil untuk "${keyword}".</p></div>`;
        return;
      }

      results.innerHTML = posts.map(p => `
        <div class="card" style="margin-bottom:12px;">
          <h3><a href="post.html?id=${p.id}">${escapeHtml(p.title)}</a></h3>
          <div class="meta">${p.category || 'Uncategorized'} • ${new Date(p.created_at).toLocaleDateString()}</div>
          <p class="excerpt">${escapeHtml(p.excerpt || p.content.slice(0,150))}...</p>
        </div>
      `).join("");

    } catch (err) {
      results.innerHTML = `<div class="card"><p class="muted">Gagal mencari: ${err.message}</p></div>`;
    }
  });
}


/* mount when DOM ready */
document.addEventListener("DOMContentLoaded", ()=>{
  try { nav_init(); } catch(e){ console.error(e); }
  // initialize known page components if present
  home_init(); post_init(); login_init(); register_init();
  dashboard_init(); create_init(); edit_init(); categories_init(); archive_init(); search_init();
});