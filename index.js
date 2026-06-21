let SVG_NS = 'http://www.w3.org/2000/svg';
let now = new Date();

let yr   = now.getFullYear();
let mo   = now.toLocaleString('en', { month: 'long' });
let moS  = now.toLocaleString('en', { month: 'short' });
let d    = now.getDate();
let hh   = pad2(now.getHours());
let mm   = pad2(now.getMinutes());
let ss   = pad2(now.getSeconds());
let y0   = new Date(yr, 0, 1);
let doy  = Math.floor((now - y0) / 86400000) + 1;

// ── Solar math ────────────────────────────────────────────────
function solarElevationDeg(lat, lon, now) {
  let LAT = lat * Math.PI / 180;
  let jan1 = Date.UTC(now.getUTCFullYear(), 0, 1);
  let N = Math.floor((now - jan1) / 86400000) + 1;
  let G = (2 * Math.PI / 365) * (N - 1);
  let decl = 0.006918 - 0.399912 * Math.cos(G) + 0.070257 * Math.sin(G)
           - 0.006758 * Math.cos(2*G) + 0.000907 * Math.sin(2*G)
           - 0.002697 * Math.cos(3*G) - 0.00148  * Math.sin(3*G);
  let eot  = (229.18 * (0.000075 + 0.001868 * Math.cos(G) - 0.032077 * Math.sin(G)
           - 0.014615 * Math.cos(2*G) - 0.04089 * Math.sin(2*G))) / 60;
  let utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  let solarTime = utcH + lon / 15 + eot;
  let ha  = ((solarTime - 12) * 15) * Math.PI / 180;
  let el  = Math.asin(Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(ha));
  return el * 180 / Math.PI;
}
function smoothstep(a, b, x) {
  let t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ── Build starfield ───────────────────────────────────────────
(function() {
  let svg = document.querySelector('.cos-stars');
  svg.innerHTML = '';
  for (let i = 0; i < 90; i++) {
    let x = (i * 137.508) % 1440;
    let y = ((i * 73.21) + 47) % 2400;
    let r = 0.4 + ((i * 31) % 11) / 18;
    let o = 0.25 + ((i * 19) % 7) / 12;
    let c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', x.toFixed(1)); c.setAttribute('cy', y.toFixed(1));
    c.setAttribute('r',  r.toFixed(2)); c.setAttribute('fill', '#ece2c8');
    c.setAttribute('opacity', o.toFixed(2));
    svg.appendChild(c);
  }
})();

let loc = { lat: 51.5, lon: 0, label: 'Greenwich · UK' };
let timeOverride = null;
let modeOverride = localStorage.getItem('sp-mode') || null; // null = auto, 'day' = forced light, 'night' = forced dark

// Cache IP-based geolocation in localStorage so hot reloads don't hammer ipapi.
(function() {
  let CACHE_KEY = 'sp-geoloc';
  let CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  try {
    let cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && cached.loc && (Date.now() - cached.ts) < CACHE_TTL) {
      loc = cached.loc;
      return;
    }
  } catch (e) { /* corrupt cache — fall through to fetch */ }

  fetch('https://ipapi.co/json/')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d || d.error || d.latitude == null) return;
      let parts = [d.city, d.country_name].filter(Boolean).join(', ');
      loc = { lat: d.latitude, lon: d.longitude, label: parts || 'detected' };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ loc: loc, ts: Date.now() })); } catch (e) {}
    })
    .catch(function(){});
})();

let spPhase    = document.getElementById('sp-phase');
let spElev     = document.getElementById('sp-elev');
let spTime     = document.getElementById('sp-time');
let spLoc      = document.getElementById('sp-loc');
let spMix      = document.getElementById('sp-mix');
let spSlider   = document.getElementById('sp-slider');
let spLiveBtn  = document.getElementById('sp-live-btn');
let spHline    = document.getElementById('sp-hline');
let spArc      = document.getElementById('sp-arc');
let spSun      = document.getElementById('sp-sun');
let spRise     = document.getElementById('sp-rise');
let spSet      = document.getElementById('sp-set');
let spPanel    = document.getElementById('sun-panel');
let spScrubWrap = document.getElementById('sp-scrub-wrap');

spSlider.addEventListener('input', function(e){ timeOverride = parseFloat(e.target.value); });
spLiveBtn.addEventListener('click', function(){ timeOverride = null; });

let spModeBtn = document.getElementById('sp-mode-btn');
spModeBtn.addEventListener('click', function(){
  if (modeOverride === null) modeOverride = 'day';
  else if (modeOverride === 'day') modeOverride = 'night';
  else modeOverride = null;
  if (modeOverride) localStorage.setItem('sp-mode', modeOverride);
  else localStorage.removeItem('sp-mode');
  tick();
});

let spRestore = document.getElementById('sp-restore');
document.getElementById('sp-hide-btn').addEventListener('click', function(){
  spPanel.style.display = 'none';
  spRestore.style.display = 'flex';
});
spRestore.addEventListener('click', function(){
  spPanel.style.display = 'block';
  spRestore.style.display = 'none';
});

function pad2(n){ return String(n).padStart(2, '0'); }

let runUpdates = function(){};

function tick() {
  let real = new Date();
  let now;
  if (timeOverride == null) {
    now = real;
    spSlider.value = real.getHours() + real.getMinutes() / 60;
  } else {
    now = new Date(real);
    let h = Math.floor(timeOverride);
    let m = Math.floor((timeOverride - h) * 60);
    let s = Math.floor(((timeOverride - h) * 60 - m) * 60);
    now.setHours(h, m, s, 0);
  }

  let yr   = now.getFullYear();
  let mo   = now.toLocaleString('en', { month: 'long' });
  let moS  = now.toLocaleString('en', { month: 'short' });
  let d    = now.getDate();
  let hh   = pad2(now.getHours());
  let mm   = pad2(now.getMinutes());
  let ss   = pad2(now.getSeconds());
  let y0   = new Date(yr, 0, 1);
  let doy  = Math.floor((now - y0) / 86400000) + 1;

  let elev     = solarElevationDeg(loc.lat, loc.lon, now);
  let nightMix = 1 - smoothstep(-1, 1, elev);

  let phase = elev > 10 ? 'day'
    : elev > 0  ? 'golden hour'
    : elev > -6 ? 'civil twilight'
    : elev > -12 ? 'nautical twilight'
    : 'night';

  // Crossfade layers
  let almLayer = document.getElementById('alm-layer');
  let cosLayer = document.getElementById('cos-layer');
  let effectiveMix = modeOverride === 'day' ? 0 : modeOverride === 'night' ? 1 : nightMix;
  almLayer.style.opacity = (1 - effectiveMix);
  cosLayer.style.opacity = effectiveMix;
  cosLayer.style.pointerEvents = effectiveMix >= 0.5 ? 'auto' : 'none';

  // Almanac nav
  // document.getElementById('alm-vol').textContent  = 'Vol. ' + (yr - 1999);
  // document.getElementById('alm-num').textContent  = '№ ' + Math.ceil(d / 7);
  document.getElementById('alm-date').textContent = mo + ' ' + d + ', ' + yr;
  document.getElementById('alm-year').textContent = yr;
  // document.getElementById('alm-month').textContent = mo.toLowerCase();

  // Cosmos nav
  document.getElementById('cos-time').textContent = hh + ':' + mm + ':' + ss;
  document.getElementById('cos-date').textContent = moS + ' ' + d + ' ' + yr;
  document.getElementById('cos-year').textContent = yr;

  runUpdates();

  // Sun panel
  let dark   = modeOverride === 'day' ? false : modeOverride === 'night' ? true : nightMix > 0.5;
  let fg     = dark ? 'rgba(236,226,200,0.92)' : 'rgba(28,22,16,0.92)';
  let fgMute = dark ? 'rgba(236,226,200,0.55)' : 'rgba(28,22,16,0.55)';
  let accent = dark ? '#d6ab5e' : '#8a3a13';
  let border = dark ? 'rgba(214,171,94,0.28)' : 'rgba(28,22,16,0.18)';

  spPanel.className   = dark ? 'night' : 'day';
  spRestore.className = dark ? 'night' : 'day';
  spPhase.textContent = phase;
  spPhase.style.color = accent;
  spElev.textContent  = elev.toFixed(1) + '°';
  spTime.textContent  = hh + ':' + mm;
  spLoc.textContent   = loc.label;
  spMix.textContent   = Math.round(nightMix * 100) + '%';

  let elevC = Math.max(-30, Math.min(60, elev));
  let sunY  = 50 - (elevC / 60) * 35;
  spSun.setAttribute('cy', sunY.toFixed(1));
  spSun.setAttribute('fill', dark ? '#f5d78f' : '#e0a330');
  spSun.style.filter = dark ? 'drop-shadow(0 0 6px #f5d78f)' : 'none';
  spHline.setAttribute('stroke', fgMute);
  spArc.setAttribute('stroke', fgMute);
  spRise.setAttribute('fill', fgMute);
  spSet.setAttribute('fill', fgMute);

  document.querySelectorAll('.sp-row-label, .sp-scrub-label').forEach(function(el){ el.style.color = fgMute; });
  document.querySelectorAll('.sp-row-val, .sp-ticks span').forEach(function(el){ el.style.color = fg; });
  spScrubWrap.style.borderTopColor = border;
  spLiveBtn.style.borderColor = border;
  spLiveBtn.style.color = timeOverride == null ? accent : fgMute;
  spLiveBtn.textContent = timeOverride == null ? 'live' : 'snap to live';

  spModeBtn.textContent = modeOverride === null ? 'auto' : modeOverride;
  spModeBtn.style.color = modeOverride === null ? fgMute : accent;
  spModeBtn.style.borderColor = border;
  document.getElementById('sp-mode-wrap').style.borderTopColor = border;
}

tick();
setInterval(tick, 1000);

// ── Table of contents, numbering & cross-references ────────────
//
// Everything is driven by classes on elements inside `article.art-body`:
//
//   h2 / h3      build the table of contents (h2 = top level, h3 nested).
//   .ref         a referenceable element — its number is stored in `refs`
//                so that cross-references can point at it.
//   .num         the element shows a number (1, 2, 3 …).
//   .num.rom     that number is rendered in roman numerals (i, ii, iii …).
//
// `.num` / `.rom` apply to headings and `.ref` elements alike: a heading
// without `.num` still appears in the contents, just unnumbered.
//
// A `.ref` element's counter is grouped by its *type* class — the class that
// is not `ref` / `num` / `rom` / `block` — so figures and insights count
// independently. Its prefix label comes from `data-label` (e.g. "Figure").
//
// Cross-references: a `.figure-number` span carrying `data-fid` is filled with
// the stored number of the `.ref` whose base key matches, within the same
// layer. Ids are namespaced with the layer prefix so the duplicated almanac /
// cosmos content never collides.
let refs = {};

function toRoman(n) {
    let map = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],
               [50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
    let out = '';
    map.forEach(function (pair) { while (n >= pair[0]) { out += pair[1]; n -= pair[0]; } });
    return out;
}

function initRef(p) {
    let article = document.querySelector('#' + p + '-layer article.art-body');
    if (!article) return;

    let indexEl = document.getElementById(p + '-article-index');
    let tocUl   = indexEl ? indexEl.querySelector('ul') : null;

    let h2Count = 0, h3Display = '', groups = {};

    function slug(str) {
        return p + '-' + str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/).join('-');
    }

    // A number formatted per the element's own `.num` / `.rom` classes.
    function fmt(n, el) {
        return el.classList.contains('rom') ? toRoman(n) : String(n);
    }

    function addToc(text, id, prefix, level) {
        if (!tocUl) return;
        let li = document.createElement('li');
        if (level > 0) li.style.marginLeft = 'var(--ms2)';
        li.innerHTML = '<a href="#' + id + '">' + (prefix ? prefix + ' ' : '') + text + '</a>';
        tocUl.appendChild(li);
    }

    article.querySelectorAll('h2, h3, .ref').forEach(function (el) {
        if (el.tagName === 'H2') {
            let text = el.textContent;
            let id = slug(text);
            el.id = id;
            let display = '';
            if (el.classList.contains('num')) {
                h2Count++;
                display = fmt(h2Count, el);
                el.insertAdjacentHTML('afterbegin', '<span class="numbering">' + display + '.</span>');
            }
            h3Display = display;            // remember for nested h3 numbering
            if (el.classList.contains('ref')) refs[id] = display;
            addToc(text, id, display ? display + '.' : '', 0);

        } else if (el.tagName === 'H3') {
            let text = el.textContent;
            let id = slug(text);
            el.id = id;
            let prefix = '';
            if (el.classList.contains('num')) {
                groups.h3 = (groups.h3 || 0) + 1;
                let self = fmt(groups.h3, el);
                prefix = h3Display ? h3Display + '.' + self : self;
                el.insertAdjacentHTML('afterbegin', '<span class="numbering">' + prefix + '</span>');
            }
            if (el.classList.contains('ref')) refs[id] = prefix;
            addToc(text, id, prefix, 1);

        } else {
            // Generic referenceable element (figure, insight, …).
            if (!el.classList.contains('num')) return;

            let type = Array.prototype.find.call(el.classList, function (c) {
                return c !== 'ref' && c !== 'num' && c !== 'rom' && c !== 'block';
            }) || 'ref';
            groups[type] = (groups[type] || 0) + 1;
            let number = fmt(groups[type], el);

            let baseKey = el.dataset.ref || el.dataset.fig || el.id;
            if (baseKey) {
                el.id = p + '-' + baseKey;
                refs[el.id] = number;
            }

            let label  = el.dataset.label || (type !== 'ref' ? type[0].toUpperCase() + type.slice(1) : '');
            let target = el.querySelector('h2, h3, h4, p') || el;
            target.insertAdjacentHTML('afterbegin',
                '<span class="numbering">' + (label ? label + ' ' : '') + number + '.</span>');
        }
    });

    // Resolve cross-reference spans against the refs collected above.
    article.querySelectorAll('.figure-number').forEach(function (el) {
        let key = el.dataset.fid || el.dataset.ref;
        el.textContent = key ? (refs[p + '-' + key] || '') : '';
    });
}

initRef('alm');
initRef('cos');

// ── Supabase (shared by auth + tracking) ──────────────────────
let SUPABASE_URL  = 'https://hbiyyreqmliesghdclpg.supabase.co';
let SUPABASE_ANON = 'sb_publishable_OsrWXMOvvDm0PluzQE6-6g_zb2yaaP7';
let SESSION_KEY   = 'alr_sid';

let sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Visit tracking ────────────────────────────────────────────
let trackToken = localStorage.getItem(SESSION_KEY);
if (!trackToken) {
  trackToken = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, trackToken);
}

function trackVisit(authSession) {
  // Pass user JWT when authenticated so the edge function can record user_id;
  // fall back to anon key for unauthenticated visits.
  let bearer = authSession ? authSession.access_token : SUPABASE_ANON;
  fetch(SUPABASE_URL + '/functions/v1/track-visit', {
    method:    'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + bearer },
    body: JSON.stringify({
      session_token: trackToken,
      page:          location.pathname,
      referrer:      document.referrer || null,
    }),
  }).catch(function () {});
}

// ── Auth UI ───────────────────────────────────────────────────
let authStatus = 'loading'; // loading | idle | form | sent | signed-in
let authSession = null;
let tracked = false;

function renderAuth() {
  let html = authHTML();
  ['alm-auth', 'cos-auth'].forEach(function (id) {
    let el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
}

function authHTML() {
  if (authStatus === 'loading') return '';

  if (authStatus === 'signed-in') {
    let email = authSession.user.email;
    return 'signed in as ' + email +
      ' &middot; <button class="site-auth-link" onclick="authSignOut()">sign out</button>';
  }

  if (authStatus === 'sent') {
    return 'magic link sent — check your email';
  }

  if (authStatus === 'form') {
    return '<form class="site-auth-form" onsubmit="authSendLink(event)">' +
      '<input class="site-auth-input" type="email" placeholder="your@email.com" required autofocus />' +
      '<button class="site-auth-link" type="submit">send link</button>' +
      '<button class="site-auth-link" type="button" onclick="authCancel()">×</button>' +
      '</form>';
  }

  // idle
  return '<button class="site-auth-link" onclick="authShowForm()">sign in</button>';
}

function authShowForm()  { authStatus = 'form'; renderAuth(); }
function authCancel()    { authStatus = 'idle'; renderAuth(); }

function authSendLink(e) {
  e.preventDefault();
  let email = e.target.querySelector('input').value;
  sb.auth.signInWithOtp({
    email: email,
    options: { emailRedirectTo: window.location.origin },
  }).then(function (res) {
    if (res.error) { alert(res.error.message); return; }
    authStatus = 'sent';
    renderAuth();
  });
}

function authSignOut() {
  sb.auth.signOut().then(function () {
    authStatus = 'idle';
    authSession = null;
    renderAuth();
  });
}

// Auth state drives both UI and tracking — track exactly once on INITIAL_SESSION.
sb.auth.onAuthStateChange(function (event, session) {
  authSession = session;
  authStatus  = session ? 'signed-in' : (authStatus === 'sent' ? 'sent' : 'idle');
  renderAuth();

  if (event === 'INITIAL_SESSION' && !tracked) {
    tracked = true;
    trackVisit(session);
  }
});