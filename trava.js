/* =====================================================================
   TRAVA DOS SITES — problemsite.github.io/trava.js
   ---------------------------------------------------------------------
   Cada site coloca, DEPOIS das 3 linhas do Firebase (app, auth, database):

     <script src="/trava.js" data-site="NOME_DO_REPO"></script>            (jogo)
     <script src="/trava.js" data-site="NOME_DO_REPO" data-modo="adm"></script> (ADM)

   - jogo:  fecha a tela se o site estiver BLOQUEADO; se houver senha dos
            jogadores (definida no painel), pede a senha antes de abrir.
   - adm:   só abre para navegadores liberados (ADM).
   - Quem é ADM vê tudo, mesmo bloqueado.
   A proteção de verdade fica nas REGRAS do Firebase; isto aqui é a tela.

   COFRE (data-cofre="1"): o site publicado só tem esta página + arquivos
   EMBARALHADOS (pasta x/). A chave fica no Firebase (chaves/<site>) e as
   regras só entregam quando o jogo está aberto (e com a senha, se ligada);
   a do ADM só para a conta da equipe. Com a chave, o sw.js do site
   desembaralha os arquivos no navegador. Fechou = a chave é esquecida e a
   página volta para a tela de bloqueio.
   ===================================================================== */
(function () {
  const CONFIG = {
    apiKey: "AIzaSyBQzl3bmbAEcyNfwqYj69DZHLjFfydlghI",
    authDomain: "jogos-github.firebaseapp.com",
    databaseURL: "https://jogos-github-default-rtdb.firebaseio.com",
    projectId: "jogos-github",
    storageBucket: "jogos-github.firebasestorage.app",
    messagingSenderId: "304376569454",
    appId: "1:304376569454:web:cd724cf50bef036a37907f"
  };
  const me = document.currentScript;
  const SITE = (me && me.dataset.site) || "";
  const MODO = (me && me.dataset.modo) || "jogo"; // jogo | adm | principal
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const COFRE = !!(me && me.dataset.cofre);           // esta é a página-cofre (o jogo ainda não foi aberto)
  const ESCOPO = "/" + SITE + "/";
  const temSW = "serviceWorker" in navigator;
  const dentroDoCofre = !COFRE && temSW && !!navigator.serviceWorker.controller; // página já desembaralhada

  // os sites usam esta config (pasta própria dentro do Firebase único)
  window.FIREBASE_CONFIG = CONFIG;
  if (SITE && !window.DB_ROOT) window.DB_ROOT = "sites/" + SITE;

  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  // ---------- tela de bloqueio ----------
  const css = `
  #trava-ov{position:fixed;inset:0;z-index:2147483000;display:none;place-items:center;background:radial-gradient(120% 90% at 50% 0%,#5ff6f6 0%,#00e8e8 45%,#00b9c8 100%);font-family:"Lilita One","Nunito",system-ui,sans-serif;color:#0d4a93;text-align:center;padding:24px}
  #trava-ov.on{display:grid;animation:travaIn .35s ease}
  @keyframes travaIn{from{opacity:0}}
  #trava-ov .tb{display:flex;flex-direction:column;align-items:center;gap:14px;max-width:520px}
  #trava-ov .hex{width:120px;height:132px;background:#fff;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);display:grid;place-items:center;font-size:54px;filter:drop-shadow(0 6px 10px rgba(13,74,147,.3));animation:travaBob 2.4s ease-in-out infinite}
  @keyframes travaBob{50%{transform:translateY(-8px) rotate(-4deg)}}
  #trava-ov h2{margin:0;font-weight:400;font-size:clamp(30px,6vw,52px);color:#fff;text-shadow:0 4px 0 #0d4a93}
  #trava-ov p{margin:0;font-family:"Nunito",system-ui,sans-serif;font-weight:900;font-size:18px;color:#0d4a93}
  #trava-ov small{font-family:"Nunito",system-ui,sans-serif;font-weight:800;font-size:14px;color:#145e86;opacity:.85}
  #trava-ov a{display:inline-block;margin-top:6px;background:#0d4a93;color:#fff;text-decoration:none;font-family:"Nunito",sans-serif;font-weight:900;padding:10px 18px;border-radius:12px}
  #trava-ov form{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:4px}
  #trava-ov input{font:900 20px "Nunito",system-ui,sans-serif;text-align:center;padding:12px 16px;border-radius:14px;border:3px solid #0d4a93;outline:none;width:240px;max-width:80vw;color:#0d4a93;background:#fff}
  #trava-ov button{font:400 22px "Lilita One","Nunito",sans-serif;color:#fff;background:#0d4a93;border:0;border-radius:14px;padding:10px 28px;cursor:pointer;box-shadow:0 4px 0 #082f5e}
  #trava-ov button:disabled{opacity:.6}
  #trava-ov .err{min-height:20px;color:#b3002d}
  #trava-ov .shake{animation:travaShake .35s}
  @keyframes travaShake{25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
  #trava-tag{position:fixed;z-index:2147483001;left:50%;transform:translateX(-50%);top:8px;background:#0d4a93;color:#fff;font:900 12px "Nunito",system-ui,sans-serif;padding:5px 10px;border-radius:99px;opacity:.85;pointer-events:none;display:none}`;
  let ov, tag;
  function ensureUI() {
    if (ov) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    ov = document.createElement("div"); ov.id = "trava-ov";
    tag = document.createElement("div"); tag.id = "trava-tag";
    const add = () => { document.body.appendChild(ov); document.body.appendChild(tag); };
    document.body ? add() : document.addEventListener("DOMContentLoaded", add);
  }
  let ovKind = "";
  function showLock(kind) {
    ensureUI();
    if (ovKind === "lock" && ov.classList.contains("on")) return;
    ovKind = "lock";
    // jogo: não dá nenhuma pista de como liberar. ADM: só abre com o login do Google da equipe (sem senha para tentarem adivinhar)
    ov.innerHTML = kind === "adm"
      ? `<div class="tb"><div class="hex">🔒</div><h2>ADM</h2><p>Entre com a conta da equipe.</p><button type="button" class="tv-g">Entrar com Google</button><p class="err"></p></div>`
      : `<div class="tb"><div class="hex">🔒</div><h2>Fechado no momento</h2><p>Este site está fechado agora.</p><small>Ele abre sozinho quando for liberado.</small></div>`;
    const bg = ov.querySelector(".tv-g");
    if (bg) bg.onclick = async () => {
      bg.disabled = true; ov.querySelector(".err").textContent = "";
      try { const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" }); await firebase.auth().signInWithPopup(p); }
      catch (e) { if (!/popup-closed|cancelled-popup/.test(e.code || "")) ov.querySelector(".err").textContent = "Não deu para entrar. Tente de novo."; }
      bg.disabled = false;
    };
    ov.classList.add("on");
    document.documentElement.style.overflow = "hidden";
  }
  function showMsg(titulo, txt) {
    ensureUI(); ovKind = "msg";
    ov.innerHTML = `<div class="tb"><div class="hex">🔒</div><h2>${titulo}</h2><small>${txt || ""}</small></div>`;
    ov.classList.add("on"); document.documentElement.style.overflow = "hidden";
  }
  function hideLock() { if (ov) ov.classList.remove("on"); ovKind = ""; document.documentElement.style.overflow = ""; }
  // tela da senha dos jogadores
  let tryPass = null;
  function showPass() {
    ensureUI();
    if (ovKind === "pass" && ov.classList.contains("on")) return;
    ovKind = "pass";
    ov.innerHTML = `<div class="tb"><div class="hex">🔑</div><h2>Senha</h2><form autocomplete="off"><input type="password" placeholder="••••••" aria-label="Senha"><button type="submit">Entrar</button><p class="err"></p></form></div>`;
    ov.classList.add("on");
    document.documentElement.style.overflow = "hidden";
    const f = ov.querySelector("form"), inp = f.querySelector("input"), btn = f.querySelector("button"), err = f.querySelector(".err");
    setTimeout(() => inp.focus(), 50);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = inp.value.trim(); if (!v || !tryPass) return;
      btn.disabled = true; err.textContent = "";
      const ok = await tryPass(v);
      if (ok) { location.reload(); return; }
      btn.disabled = false; inp.value = ""; inp.focus();
      err.textContent = "Senha incorreta";
      const tb = ov.querySelector(".tb"); tb.classList.remove("shake"); void tb.offsetWidth; tb.classList.add("shake");
    };
  }
  let tagShown = "";
  function showTag(txt) {
    ensureUI();
    if (txt === tagShown) return; tagShown = txt;
    tag.textContent = txt; tag.style.transition = "opacity .6s"; tag.style.opacity = ".9"; tag.style.display = txt ? "block" : "none";
    clearTimeout(showTag.t); if (txt) showTag.t = setTimeout(() => { tag.style.opacity = "0"; }, 5000); // some sozinho (não aparece na gravação)
  }

  // esconde a página até saber se pode abrir (evita "piscar" o conteúdo)
  const hideStyle = document.createElement("style");
  hideStyle.textContent = "body>*:not(#trava-ov):not(#trava-tag){visibility:hidden}";
  document.head.appendChild(hideStyle);
  const reveal = () => hideStyle.remove();
  setTimeout(() => { if (!decided) { reveal(); } }, 8000); // nunca prender a página por erro de rede

  let decided = false, admin = false, ctl = null, offset = 0, lockedState = null, listeners = [];
  let senhaAtiva = false, senhaOk = true; // senha dos jogadores (só nos jogos)
  const passNeeded = () => MODO !== "adm" && !admin && !!senhaAtiva && !senhaOk;
  const api = {
    site: SITE, modo: MODO, config: CONFIG,
    get admin() { return admin; },
    onChange(fn) { listeners.push(fn); },
    ready: null
  };
  window.Trava = api;

  // ---------- cofre ----------
  let dbRef = null, abrindo = false;
  const pede = (sw, msg) => new Promise((ok) => {
    const ch = new MessageChannel(); ch.port1.onmessage = () => ok(true);
    sw.postMessage(msg, [ch.port2]); setTimeout(() => ok(false), 4000);
  });
  async function swAtivo() {
    const reg = await navigator.serviceWorker.register(ESCOPO + "sw.js", { scope: ESCOPO });
    const sw = reg.active || reg.waiting || reg.installing;
    if (sw.state !== "activated") await new Promise((ok) => { sw.addEventListener("statechange", () => { if (sw.state === "activated") ok(); }); setTimeout(ok, 5000); });
    return reg.active || sw;
  }
  async function abreCofre() {
    if (abrindo) return; abrindo = true;
    showMsg("Abrindo…", "");
    if (!temSW) { showMsg("Não deu para abrir", "Este navegador não abre o jogo (no modo anônimo de alguns navegadores não funciona)."); return; }
    // evita ficar recarregando sem parar se algo der errado
    const K = "cofre-tent:" + SITE, t = JSON.parse(sessionStorage.getItem(K) || "[]").filter((x) => Date.now() - x < 30000);
    if (t.length >= 3) { showMsg("Não deu para abrir", "Recarregue a página daqui a pouco."); sessionStorage.removeItem(K); return; }
    try {
      let jogo = null, adm = null;
      try { jogo = (await dbRef.ref("chaves/" + SITE + "/jogo").once("value")).val(); } catch (e) {}
      if (admin) { try { adm = (await dbRef.ref("chaves/" + SITE + "/adm").once("value")).val(); } catch (e) {} }
      if (!(MODO === "adm" ? adm : jogo)) { abrindo = false; showLock(MODO === "adm" ? "adm" : "jogo"); return; }
      const ate = (!admin && ctl && ctl.until) ? Math.min(ctl.until - offset, Date.now() + 12 * 3600e3) : Date.now() + 12 * 3600e3;
      const sw = await swAtivo();
      await pede(sw, { tipo: "chave", jogo, adm, exp: ate });
      t.push(Date.now()); sessionStorage.setItem(K, JSON.stringify(t));
      location.reload();
    } catch (e) { console.warn("[trava] cofre", e); showMsg("Não deu para abrir", "Recarregue a página."); }
  }
  let esquecendo = false;
  async function esqueceCofre() {
    if (esquecendo) return; esquecendo = true;
    showMsg("Fechado no momento", "");
    try { await pede(navigator.serviceWorker.controller, { tipo: "esquece" }); } catch (e) {}
    location.reload();
  }

  function computeOpen() {
    if (admin) return true;
    if (MODO === "adm") return false;
    // o site principal só fecha se for bloqueado de propósito no painel
    if (MODO === "principal" && (!ctl || ctl.open === undefined)) return true;
    if (!ctl || ctl.open !== true) return false;
    if (ctl.until && ctl.until <= Date.now() + offset) return false;
    return true;
  }
  let firstState = true;
  function apply() {
    const open = computeOpen(), pass = open && passNeeded();
    if (lockedState === null) lockedState = !open || pass;
    if ((!open || pass) && dentroDoCofre) { esqueceCofre(); return; } // fechou com o jogo na tela: tira o jogo e volta para o cofre
    if (!open) { showLock(MODO === "adm" ? "adm" : "jogo"); lockedState = true; }
    else if (pass) { showPass(); lockedState = true; }
    else if (COFRE) { abreCofre(); lockedState = false; }
    else {
      hideLock();
      // estava fechado e abriu: recarrega para os dados do site carregarem
      if (lockedState === true && !firstState) { location.reload(); return; }
      lockedState = false;
    }
    if (admin && MODO !== "principal") {
      const closed = !(ctl && ctl.open === true && (!ctl.until || ctl.until > Date.now() + offset));
      showTag(MODO === "adm" ? "" : closed ? "🔒 bloqueado para o público (você está liberado)" : "");
    } else showTag("");
    if (!decided) { decided = true; reveal(); }
    firstState = false;
    listeners.forEach((f) => { try { f({ open, admin }); } catch (e) {} });
  }

  api.ready = (async () => {
    if (!window.firebase || !firebase.database || !firebase.auth) {
      if (!window.firebase) await loadScript(SDK + "firebase-app-compat.js");
      if (!firebase.auth) await loadScript(SDK + "firebase-auth-compat.js");
      if (!firebase.database) await loadScript(SDK + "firebase-database-compat.js");
    }
    if (!firebase.apps.length) firebase.initializeApp(CONFIG);
    const db = firebase.database(), auth = firebase.auth(); dbRef = db;
    db.ref(".info/serverTimeOffset").on("value", (s) => { offset = s.val() || 0; });

    // ---- senha dos jogadores ----
    // "senhacheck" só pode ser lido por quem já digitou a senha atual (regras do Firebase)
    const ensureUser = async () => auth.currentUser || (await auth.signInAnonymously()).user;
    async function checkSenha() {
      if (MODO === "adm" || admin || !senhaAtiva) { senhaOk = true; return; }
      try { await ensureUser(); await db.ref("senhacheck").once("value"); senhaOk = true; } catch (e) { senhaOk = false; }
    }
    tryPass = async (v) => {
      try { const u = await ensureUser(); await db.ref("acesso/" + u.uid).set(v); return true; } catch (e) { return false; }
    };

    // é o navegador da equipe? (o e-mail fica só nas regras do Firebase)
    let gotAuth = false, gotCtl = false, gotSenha = MODO === "adm";
    auth.onAuthStateChanged(async (u) => {
      let a = false;
      if (u && !u.isAnonymous) {
        // só o e-mail da equipe (definido nas regras do Firebase) consegue ler "admcheck"
        try { await db.ref("admcheck").once("value"); a = true; } catch (e) { a = false; }
        if (!a && MODO === "adm" && u.providerData.some((p) => p.providerId === "google.com")) { // entrou com outra conta Google: sai e avisa
          try { await auth.signOut(); } catch (e) {}
          setTimeout(() => { const er = ov && ov.querySelector(".err"); if (er) er.textContent = "Essa conta Google não tem acesso."; }, 50);
          return;
        }
      }
      const changed = a !== admin; admin = a; gotAuth = true;
      if (gotCtl && decided) { if (changed && MODO === "adm" && a) { location.reload(); return; } if (changed) await checkSenha(); apply(); }
    });
    if (SITE && MODO !== "adm") {
      db.ref("controle/sites/" + SITE).on("value", async (s) => { ctl = s.val() || {}; gotCtl = true; if (gotAuth && decided) { if (computeOpen()) await checkSenha(); apply(); } }, () => { ctl = {}; gotCtl = true; if (gotAuth) apply(); });
    } else { ctl = {}; gotCtl = true; }
    if (MODO !== "adm") {
      db.ref("controle/senhaAtiva").on("value", async (s) => {
        senhaAtiva = s.val() || false;
        if (!gotSenha) { gotSenha = true; return; }
        if (decided) { await checkSenha(); apply(); }
      }, () => { gotSenha = true; });
    }
    // espera o primeiro resultado
    await new Promise((r) => { const t = setInterval(() => { if (gotAuth && gotCtl && gotSenha) { clearInterval(t); r(); } }, 30); });
    if (computeOpen()) await checkSenha();
    apply();
    // senha trocada no painel: quem estava jogando volta para a tela da senha
    if (MODO !== "adm") setInterval(async () => { if (senhaAtiva && senhaOk && !admin && computeOpen()) { await checkSenha(); if (!senhaOk) apply(); } }, 30000);
    // fecha sozinho quando o "liberado até" passar
    setInterval(() => { if (!admin && ctl && ctl.until) apply(); }, 5000);
    return { open: computeOpen(), admin };
  })().catch((e) => { console.warn("[trava]", e); reveal(); });
})();
