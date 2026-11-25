/* ==========================================================================
   Doctors Speak — общий подвал сайта
   Подключение: <script src="/assets/site.js" defer></script>
   Подвал встаёт в <div id="ds-footer"></div>, а если его нет — в конец <body>.
   Язык (RU/KZ) берётся из того же места, где его хранят страницы,
   и обновляется после нажатия на переключатель языка.
   ========================================================================== */
(function () {
  var WA = "https://wa.me/77081595038?text=";
  var TEXT = {
    ru: {
      tagline: "Медицинский английский для врачей и резидентов",
      nav: [["/", "Главная"], ["/grammar/", "Видеокурс"], ["/test/", "Тест уровня"], ["/tarifs/", "Тарифы"]],
      navTitle: "Разделы",
      contactTitle: "Связаться",
      wa: "Написать в WhatsApp",
      waMsg: "Здравствуйте! Хочу получить доступ на kazdoctors.com"
    },
    kz: {
      tagline: "Дәрігерлер мен резиденттерге арналған медициналық ағылшын",
      nav: [["/", "Басты бет"], ["/grammar/", "Видеокурс"], ["/test/", "Деңгей тесті"], ["/tarifs/", "Тарифтер"]],
      navTitle: "Бөлімдер",
      contactTitle: "Байланыс",
      wa: "WhatsApp-қа жазу",
      waMsg: "Сәлеметсіз бе! kazdoctors.com сайтына доступ алғым келеді"
    }
  };

  function currentLang() {
    var b = document.body;
    if (b && /\blang-kz\b/.test(b.className)) return "kz";
    if (b && /\blang-ru\b/.test(b.className)) return "ru";
    var saved = null;
    try {
      saved = localStorage.getItem("doctors_speak_lang") || localStorage.getItem("selected_lang");
    } catch (e) {}
    return saved === "kz" ? "kz" : "ru";
  }

  function render() {
    var t = TEXT[currentLang()];
    var year = new Date().getFullYear();
    var here = location.pathname.replace(/index\.html$/, "");
    var links = t.nav.map(function (n) {
      var active = here === n[0] ? ' aria-current="page"' : "";
      return '<a href="' + n[0] + '"' + active + ">" + n[1] + "</a>";
    }).join("");

    var html =
      '<div class="ds-footer__inner">' +
        '<div class="ds-footer__brand">' +
          '<a class="ds-footer__logo" href="/">Doctors Speak</a>' +
          '<p>' + t.tagline + '</p>' +
        '</div>' +
        '<nav class="ds-footer__col" aria-label="' + t.navTitle + '">' +
          '<span class="ds-footer__title">' + t.navTitle + '</span>' + links +
        '</nav>' +
        '<div class="ds-footer__col">' +
          '<span class="ds-footer__title">' + t.contactTitle + '</span>' +
          '<a class="ds-footer__wa" href="' + WA + encodeURIComponent(t.waMsg) + '" target="_blank" rel="noopener noreferrer">' + t.wa + '</a>' +
          '<a href="https://instagram.com/doctors.speak" target="_blank" rel="noopener noreferrer">Instagram @doctors.speak</a>' +
        '</div>' +
      '</div>' +
      '<div class="ds-footer__bottom">© ' + year + ' kazdoctors.com</div>';

    var footer = document.querySelector("footer.ds-footer");
    if (!footer) {
      footer = document.createElement("footer");
      footer.className = "ds-footer";
      // на тёмных страницах (вход) подвал тоже тёмный
      if (document.querySelector("header.ds-plain")) footer.className += " ds-footer--dark";
      var slot = document.getElementById("ds-footer");
      if (slot) slot.replaceWith(footer);
      else document.body.appendChild(footer);
    }
    footer.innerHTML = html;
  }

  function init() {
    render();
    // переключатели языка на страницах устроены по-разному — просто перерисовываем после клика
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".lang-btn, .lang-switch, [onclick*='Lang'], [onclick*='lang']")) {
        setTimeout(render, 60);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
