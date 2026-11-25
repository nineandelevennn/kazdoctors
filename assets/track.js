/* ==========================================================================
   Doctors Speak — журнал обучения
   Подключение: <script src="/assets/track.js?v=1" defer></script>
   Пишет в таблицу Supabase public.learning_events (SQL: «Для Supabase/1-журнал-ответов.sql»):
     view   — ученик открыл страницу
     answer — ответил на вопрос (сам ловит кнопки, которые получают класс correct / wrong)
     result — итог теста / ДЗ / экзамена (страница вызывает window.dsTrack.result(...))
   Ничего не показывает на странице и не мешает её работе: при любой ошибке просто молчит.
   ========================================================================== */
(function () {
  if (window.dsTrack) return;

  var SUPABASE_URL = "https://jjfkiqmqoscnodcvdktf.supabase.co";
  var SUPABASE_KEY = "sb_publishable_2Ygo9OvIMmtCfqt1C0glow_uDGaQ7nZ";
  var AUTH_STORAGE_KEY = "sb-jjfkiqmqoscnodcvdktf-auth-token";
  var ENDPOINT = SUPABASE_URL + "/rest/v1/learning_events";

  // локальный просмотр (localhost, файл) в журнал не пишем
  var host = location.hostname;
  var enabled = location.protocol.indexOf("http") === 0 && host !== "localhost" && host !== "127.0.0.1" && host !== "";
  var debug = /[?&]track=debug\b/.test(location.search);

  var page = location.pathname.replace(/index\.html$/, "").slice(0, 120) || "/";
  var queue = [];
  var timer = null;

  function cut(s, n) {
    s = (s == null ? "" : String(s)).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function deviceId() {
    try {
      var id = localStorage.getItem("app_device_id") || localStorage.getItem("ds_device_id");
      if (!id) {
        id = "dev_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
        localStorage.setItem("ds_device_id", id);
      }
      return id.slice(0, 64);
    } catch (e) { return null; }
  }

  function lang() {
    try {
      if (/\blang-kz\b/.test(document.body.className)) return "kz";
      var l = localStorage.getItem("doctors_speak_lang") || localStorage.getItem("selected_lang");
      return l === "kz" ? "kz" : "ru";
    } catch (e) { return null; }
  }

  // токен ученика, если он вошёл (чтобы запись привязалась к его аккаунту)
  function userToken() {
    try {
      var raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      var t = s && (s.access_token || (s.currentSession && s.currentSession.access_token));
      var exp = s && (s.expires_at || (s.currentSession && s.currentSession.expires_at));
      if (!t) return null;
      if (exp && exp * 1000 < Date.now() + 30000) return null; // истёк — пишем как гость
      return t;
    } catch (e) { return null; }
  }

  function send(rows, keepalive) {
    if (!rows.length) return;
    if (debug) console.log("[dsTrack]", rows);
    if (!enabled) return;
    var token = userToken();
    var body = JSON.stringify(rows);
    var post = function (bearer) {
      return fetch(ENDPOINT, {
        method: "POST",
        keepalive: !!keepalive,
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + bearer,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: body
      });
    };
    post(token || SUPABASE_KEY).then(function (r) {
      // токен не подошёл — повторяем как гость, без привязки к аккаунту
      if (!r.ok && token && (r.status === 401 || r.status === 403)) return post(SUPABASE_KEY);
    }).catch(function () {});
  }

  function flush(keepalive) {
    if (timer) { clearTimeout(timer); timer = null; }
    var rows = queue.splice(0, queue.length);
    // если в одной пачке есть и ученик, и гость — одна пачка, сервер сам подставит аккаунт
    send(rows, keepalive);
  }

  function push(row) {
    row.page = page;
    row.device_id = deviceId();
    row.lang = lang();
    queue.push(row);
    if (queue.length >= 20) flush(false);
    else if (!timer) timer = setTimeout(function () { flush(false); }, 4000);
  }

  // ---- публичные функции для страниц ----
  window.dsTrack = {
    answer: function (item, correct, answer) {
      push({ event: "answer", item: cut(item, 300) || null, answer: cut(answer, 200) || null, correct: !!correct });
    },
    result: function (score, total, item) {
      push({ event: "result", score: score | 0, total: total | 0, item: cut(item, 300) || null });
      flush(true);
    }
  };

  // ---- просмотр страницы ----
  push({ event: "view" });

  // ---- автоматическая запись ответов ----
  var ITEM_SELECTORS = ["#questionText", "#termText", "#qPromptText", "#wothTerm", ".term-title", ".qc-question"];

  function findItem(btn) {
    var box = btn.closest(".quick-check, .question-card, .q-card");
    if (box) {
      var q = box.querySelector(".qc-question, .question-text, .q-text, h3, h4");
      if (q && q.textContent.trim()) return q.textContent;
    }
    for (var i = 0; i < ITEM_SELECTORS.length; i++) {
      var el = document.querySelector(ITEM_SELECTORS[i]);
      if (el && el.offsetParent !== null && el.textContent.trim()) return el.textContent;
    }
    return document.title;
  }

  function state(el) {
    if (!el || !el.classList) return null;
    if (el.classList.contains("wrong")) return false;
    if (el.classList.contains("correct")) return true;
    return null;
  }

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest && e.target.closest("button, .option, .opt-btn, .qc-btn, [role='button']");
    if (!btn || btn.disabled || btn.closest(".ds-footer, header, nav")) return;
    if (state(btn) !== null) return; // уже отвеченная кнопка
    var item = findItem(btn);
    var text = btn.textContent;
    var tries = 0;
    (function check() {
      var s = state(btn);
      if (s === null) s = state(btn.parentElement && btn.parentElement.closest(".option, .opt-row, li"));
      if (s !== null) {
        if (btn.__dsLogged) return;
        btn.__dsLogged = true;
        window.dsTrack.answer(item, s, text);
        return;
      }
      if (++tries < 6) setTimeout(check, 80);
    })();
  }, true);

  // отправить остаток при уходе со страницы
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", function () { flush(true); });
})();
