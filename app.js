// ============================================================
//  app.js — расписание с загрузкой timetable.json
// ============================================================

const DAY_NAMES = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const PAIRS = [
  { start: "08:30", end: "10:05" },
  { start: "10:15", end: "11:50" },
  { start: "12:20", end: "13:55" },
  { start: "14:10", end: "15:20" },
  { start: "15:30", end: "16:40" },
  { start: "16:50", end: "17:40" },
];

const WEEKS = [
  { type: 1, start: "01.09", end: "06.09" }, { type: 2, start: "07.09", end: "13.09" },
  { type: 1, start: "14.09", end: "20.09" }, { type: 2, start: "21.09", end: "27.09" },
  { type: 1, start: "28.09", end: "04.10" }, { type: 2, start: "05.10", end: "11.10" },
  { type: 1, start: "12.10", end: "18.10" }, { type: 2, start: "19.10", end: "25.10" },
  { type: 1, start: "26.10", end: "01.11" }, { type: 2, start: "02.11", end: "08.11" },
  { type: 1, start: "09.11", end: "15.11" }, { type: 2, start: "16.11", end: "22.11" },
  { type: 1, start: "23.11", end: "29.11" }, { type: 2, start: "30.11", end: "06.12" },
  { type: 1, start: "07.12", end: "13.12" }, { type: 2, start: "14.12", end: "20.12" },
  { type: 1, start: "21.12", end: "27.12" }, { type: 2, start: "28.12", end: "30.12" },
];

const LS_COURSE = "sched.course";
const LS_GROUP = "sched.group";
const LS_OVERRIDE = "sched.override";

const state = {
  base: null,
  override: null,
  course: null,
  group: null,
  pickedDayIndex: (new Date().getDay() + 6) % 7,
  pickedWeekType: 1,
};

function data() { return state.override || state.base || { 1: {}, 2: {} }; }
function $(id) { return document.getElementById(id); }

// ---------- Даты ----------
function startOfWeek(d) { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function isSameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtDate(d) { return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear(); }
function parseDDMM(s, year) { const [dd, mm] = s.split(".").map(Number); return new Date(year, mm - 1, dd); }
function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

function getWeekType(date) {
  const y = date.getFullYear();
  for (const w of WEEKS) {
    const s = parseDDMM(w.start, y), e = parseDDMM(w.end, y);
    if (date >= s && date <= e) return w.type;
  }
  const first = parseDDMM("01.09", y);
  const idx = Math.floor((startOfWeek(date) - startOfWeek(first)) / 86400000 / 7);
  return (idx % 2 === 0) ? 1 : 2;
}

function normalizeText(raw) {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(/(?:^|\s)((?:[А-ЯЁA-Z]\s+){3,}[А-ЯЁA-Z])(?=\s|$|[.,;:])/g,
    (_, l) => " " + l.replace(/\s+/g, ""));
  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^[;,.·\s]+|[;,.·\s]+$/g, "");
  return s;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Извлечение пар ----------
function extractLessons(weekType, course, group, dayIndex) {
  const dayName = DAY_NAMES[dayIndex];
  const sheet = data()?.[weekType];
  if (!sheet) return [];
  const byDay = sheet[dayName];
  if (!byDay) return [];
  const byCourse = byDay[course];
  if (!byCourse) return [];
  const arr = byCourse[group];
  if (!arr) return [];
  return arr.slice().sort((a, b) => a.p - b.p).map(x => {
    const txt = normalizeText(x.t);
    return {
      pairNum: x.p,
      start: PAIRS[x.p - 1].start,
      end: PAIRS[x.p - 1].end,
      text: txt,
      fitness: /ФИЗКУЛЬТУРА/i.test(txt),
      subgroups: x.subgroups || null,
    };
  }).filter(x => x.text.length > 0);
}

function hasLessonsOn(weekType, course, group, dayIndex) {
  return extractLessons(weekType, course, group, dayIndex).length > 0;
}

// ---------- Рендер карточки ----------
function renderLessonCard(lesson, mode) {
  const el = document.createElement("div");
  el.className = "lesson";
  if (mode === "current") el.classList.add("current");
  if (mode === "next") el.classList.add("next");
  if (mode === "past") el.classList.add("past");
  if (lesson.fitness) el.classList.add("fitness");

  let badge = "";
  if (mode === "current") badge = '<span class="badge green">сейчас</span>';
  else if (mode === "next") badge = '<span class="badge orange">следующая</span>';

  let bodyHtml;
  if (Array.isArray(lesson.subgroups) && lesson.subgroups.length) {
    bodyHtml = '<div class="subgroups">' + lesson.subgroups.map(sg => {
      const subj = sg.subject ? `<span class="sub-subject">${escapeHtml(sg.subject)}</span>` : "";
      const t = sg.teacher ? `<span class="sub-teacher">${escapeHtml(sg.teacher)}</span>` : "";
      const r = sg.room ? `<span class="sub-room">📍 ${escapeHtml(sg.room)}</span>` : "";
      return `<div class="subgroup">
        <span class="sub-tag">${escapeHtml(sg.sub)}</span>
        ${subj}
        ${t}
        ${r}
      </div>`;
    }).join("") + "</div>";
  } else {
    // Обычная пара: отделяем аудиторию от тела
    const text = lesson.text;
    const roomMatch = text.match(/(?:^|\s)([0-9]{1,2}\.[0-9]{1,2}|[0-9]{3}\s*ЭФ|ВЦ|МИЦ|ПО|планет|Спортзал)\s*$/i);
    let body = text, room = "";
    if (roomMatch) {
      room = roomMatch[1];
      body = text.slice(0, roomMatch.index).trim().replace(/[;,]\s*$/, "");
    }
    bodyHtml = `<div class="body">${escapeHtml(body)}</div>` +
      (room ? `<div class="room">📍 ${escapeHtml(room)}</div>` : "");
  }

  el.innerHTML = `
    <div class="head">
      <span class="num">${lesson.pairNum}</span>
      <span class="time">${lesson.start}–${lesson.end}</span>
      ${badge}
    </div>
    ${bodyHtml}
  `;
  return el;
}

// ---------- Блоки ----------
function renderSubtitle() {
  if (!state.course || !state.group) { $("subtitle").textContent = "—"; return; }
  const wt = getWeekType(new Date());
  $("subtitle").textContent = `${state.course} курс · ${state.group} · сейчас ${wt} неделя`;
}

function renderTodayBlock() {
  const main = $("content");
  if (!main) return;
  main.innerHTML = "";
  if (!state.base || !state.course || !state.group) {
    main.innerHTML = '<div class="empty">Загрузка…</div>';
    return;
  }
  const now = new Date(), today = new Date(now);
  const di = (today.getDay() + 6) % 7;
  const wt = getWeekType(today);
  const todayLessons = extractLessons(wt, state.course, state.group, di);
  const lastEnd = todayLessons.length ? Math.max(...todayLessons.map(l => toMin(l.end))) : 0;
  const curMin = now.getHours() * 60 + now.getMinutes();
  const showTomorrow = todayLessons.length === 0 || curMin > lastEnd;

  let date = today, dayIndex = di, weekType = wt, mode = "today";
  if (showTomorrow) {
    date = addDays(today, 1);
    dayIndex = (date.getDay() + 6) % 7;
    weekType = getWeekType(date);
    mode = "tomorrow";
  }
  const lessons = extractLessons(weekType, state.course, state.group, dayIndex);

  const h = document.createElement("div");
  h.className = "section-title " + (mode === "today" ? "today-label" : "tomorrow-label");
  const label = mode === "today" ? "Сегодня" : "Завтра";
  h.innerHTML = `<span class="dot"></span>${label} · ${DAY_NAMES[dayIndex]}, ${fmtDate(date)}`;
  main.appendChild(h);

  if (!lessons.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = mode === "today" ? "Сегодня занятий нет 🎉" : "Завтра занятий нет 🎉";
    main.appendChild(e);
    return;
  }

  let currentLesson = null, nextLesson = null;
  if (mode === "today") {
    const cm = now.getHours() * 60 + now.getMinutes();
    for (const l of lessons) if (cm >= toMin(l.start) && cm <= toMin(l.end)) currentLesson = l;
    const up = lessons.filter(l => toMin(l.start) > cm).sort((a, b) => toMin(a.start) - toMin(b.start));
    nextLesson = up[0] || null;
  }
  lessons.forEach(l => {
    let lm = "future";
    if (l === currentLesson) lm = "current";
    else if (l === nextLesson) lm = "next";
    else if (mode === "today" && toMin(l.end) < curMin) lm = "past";
    main.appendChild(renderLessonCard(l, lm));
  });
}

function renderPickedBlock() {
  const picked = $("pickedContent");
  if (!picked) return;
  picked.innerHTML = "";
  if (!state.base || !state.course || !state.group) return;
  const lessons = extractLessons(state.pickedWeekType, state.course, state.group, state.pickedDayIndex);
  if (!lessons.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "В этот день занятий нет";
    picked.appendChild(e);
    return;
  }
  lessons.forEach(l => picked.appendChild(renderLessonCard(l, "future")));
}

function renderDayTabs() {
  const tabs = $("dayTabs");
  if (!tabs) return;
  tabs.innerHTML = "";
  const today = new Date();
  const todayIdx = (today.getDay() + 6) % 7;

  for (let i = 0; i < 7; i++) {
    const has = hasLessonsOn(state.pickedWeekType, state.course, state.group, i);
    const b = document.createElement("button");
    b.innerHTML = `${DAY_SHORT[i]}<span class="dnum">${DAY_NAMES[i].slice(0, 2)}</span>`;
    if (i === todayIdx) b.classList.add("today");
    if (i === state.pickedDayIndex) b.classList.add("active");
    if (!has) b.classList.add("disabled");
    b.onclick = () => { state.pickedDayIndex = i; renderDayTabs(); renderPickedBlock(); };
    tabs.appendChild(b);
  }
}

function renderWeekButtons() {
  const w1 = $("weekBtn1"), w2 = $("weekBtn2");
  if (!w1 || !w2) return;
  w1.classList.toggle("active", state.pickedWeekType === 1);
  w2.classList.toggle("active", state.pickedWeekType === 2);
  w1.onclick = () => { state.pickedWeekType = 1; renderWeekButtons(); renderDayTabs(); renderPickedBlock(); };
  w2.onclick = () => { state.pickedWeekType = 2; renderWeekButtons(); renderDayTabs(); renderPickedBlock(); };
}

function renderAll() {
  renderSubtitle();
  renderTodayBlock();
  renderWeekButtons();
  renderDayTabs();
  renderPickedBlock();
}

// ---------- localStorage ----------
function loadPrefs() {
  try {
    const c = Number(localStorage.getItem(LS_COURSE));
    const g = localStorage.getItem(LS_GROUP);
    if (c) state.course = c;
    if (g) state.group = g;
    const ov = localStorage.getItem(LS_OVERRIDE);
    if (ov) state.override = JSON.parse(ov);
  } catch (e) { }
}
function savePrefs() {
  try {
    if (state.course) localStorage.setItem(LS_COURSE, String(state.course));
    if (state.group) localStorage.setItem(LS_GROUP, state.group);
  } catch (e) { }
}

function fillCourses() {
  const cs = $("courseSelect");
  if (!cs) return;
  cs.innerHTML = "";
  const all = new Set();
  for (const day of Object.values(data()[1] || {})) {
    Object.keys(day).forEach(c => all.add(Number(c)));
  }
  const courses = [...all].sort((a, b) => a - b);
  courses.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c + " курс";
    cs.appendChild(o);
  });
  state.course = state.course && courses.includes(state.course) ? state.course : courses[0];
  cs.value = state.course;
}

function fillGroups() {
  const gs = $("groupSelect");
  if (!gs) return;
  gs.innerHTML = "";
  const set = new Set();
  for (const wt of [1, 2]) {
    for (const day of Object.values(data()[wt] || {})) {
      if (day[state.course]) Object.keys(day[state.course]).forEach(g => set.add(g));
    }
  }
  const groups = [...set];
  groups.forEach(g => {
    const o = document.createElement("option");
    o.value = g; o.textContent = g;
    gs.appendChild(o);
  });
  state.group = state.group && groups.includes(state.group) ? state.group : groups[0];
  gs.value = state.group;
}

// ---------- Импорт / экспорт JSON ----------
function setupDownload() {
  const btn = $("downloadBtn");
  if (!btn) return;
  btn.onclick = () => {
    const payload = state.override || state.base;
    if (!payload) { alert("Нет данных для скачивания"); return; }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = "schedule_" + d.getFullYear()
      + String(d.getMonth() + 1).padStart(2, "0")
      + String(d.getDate()).padStart(2, "0") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

function setupImport() {
  const input = $("importInput");
  const status = $("importStatus");

  function setStatus(text, cls) {
    if (!status) return;
    status.textContent = text;
    status.className = "import-status " + (cls || "");
  }

  if (!input) return;
  input.addEventListener("change", e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (typeof parsed !== "object" || !parsed[1] || !parsed[2])
          throw new Error('Нет ключей "1" или "2" — не похоже на расписание');
        state.override = parsed;
        localStorage.setItem(LS_OVERRIDE, JSON.stringify(parsed));
        state.course = null; state.group = null;
        fillCourses(); fillGroups(); savePrefs();
        renderAll();
        setStatus("✔ Расписание загружено и применено", "ok");
      } catch (err) {
        setStatus("✕ Ошибка: " + err.message, "err");
      }
    };
    r.readAsText(f, "utf-8");
  });
}

function setupReset() {
  const btn = $("resetBtn");
  if (!btn) return;
  btn.onclick = () => {
    if (!confirm("Сбросить пользовательские правки и вернуть расписание из timetable.json?")) return;
    state.override = null;
    localStorage.removeItem(LS_OVERRIDE);
    state.course = null; state.group = null;
    fillCourses(); fillGroups(); savePrefs();
    renderAll();
    const s = $("importStatus");
    if (s) { s.textContent = "↺ Сброшено"; s.className = "import-status ok"; }
  };
}

// ---------- Поиск ----------
function searchSchedule(query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q || q.length < 2) return [];
  const results = [];
  const d = data();
  for (const week of Object.keys(d)) {
    for (const day of Object.keys(d[week])) {
      const byDay = d[week][day];
      for (const course of Object.keys(byDay)) {
        if (state.course && Number(course) !== Number(state.course)) continue;
        for (const group of Object.keys(byDay[course])) {
          if (state.group && group !== state.group) continue;
          const arr = byDay[course][group] || [];
          for (const lesson of arr) {
            const txt = normalizeText(lesson.t);
            if (txt.toLowerCase().includes(q)) {
              results.push({
                week: Number(week), day, course: Number(course),
                group, pair: lesson.p, text: txt
              });
            }
          }
        }
      }
    }
  }
  const dayOrder = Object.fromEntries(DAY_NAMES.map((d, i) => [d, i]));
  results.sort((a, b) => {
    if (a.week !== b.week) return a.week - b.week;
    if (dayOrder[a.day] !== dayOrder[b.day]) return dayOrder[a.day] - dayOrder[b.day];
    return a.pair - b.pair;
  });
  return results;
}

function renderSearchResults(query) {
  const box = $("searchResults");
  if (!box) return;
  box.innerHTML = "";
  const q = String(query || "").trim();
  if (q.length < 2) { box.innerHTML = '<div class="search-hint">Введите минимум 2 символа.</div>'; return; }
  const res = searchSchedule(q);
  if (!res.length) { box.innerHTML = '<div class="search-hint">Ничего не найдено.</div>'; return; }

  const head = document.createElement("div");
  head.className = "search-count";
  head.textContent = "Найдено: " + res.length;
  box.appendChild(head);

  res.slice(0, 200).forEach(r => {
    const el = document.createElement("div");
    el.className = "search-item";
    el.innerHTML = `
      <div class="search-meta">
        <span class="badge gray">${r.week} нед</span>
        <span class="search-day">${r.day}</span>
        <span class="search-pair">${r.pair} пара</span>
      </div>
      <div class="search-text">${escapeHtml(r.text)}</div>
      <div class="search-course">${r.course} курс · ${r.group}</div>
    `;
    el.onclick = () => {
      state.pickedWeekType = r.week;
      const idx = DAY_NAMES.indexOf(r.day);
      if (idx >= 0) state.pickedDayIndex = idx;
      renderWeekButtons(); renderDayTabs(); renderPickedBlock();
      const target = $("pickedContent");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    box.appendChild(el);
  });
}

function setupSearch() {
  const inp = $("searchInput");
  if (!inp) return;
  let timer = null;
  inp.addEventListener("input", e => {
    clearTimeout(timer);
    timer = setTimeout(() => renderSearchResults(e.target.value), 150);
  });
}

// ---------- Загрузка ----------
async function loadBase() {
  if (location.protocol === "file:") {
    console.error(
      "file:// — fetch(timetable.json) заблокирован CORS. " +
      "Запустите: python3 -m http.server 8000"
    );
    return null;
  }
  try {
    const res = await fetch("timetable.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (json && json[1] && json[2]) return json;
    throw new Error("Неверный формат timetable.json");
  } catch (e) {
    console.error("Не удалось загрузить timetable.json:", e);
    return null;
  }
}

// ---------- Init ----------
async function init() {
  state.base = await loadBase();
  if (!state.base) {
    $("content").innerHTML =
      '<div class="empty">' +
      'Не удалось загрузить <code>timetable.json</code>.<br><br>' +
      'Если открываете через <code>file://</code> — запустите локальный сервер:<br>' +
      '<code>python3 -m http.server 8000</code><br>' +
      'и откройте <a href="http://localhost:8000">http://localhost:8000</a>' +
      '</div>';
    return;
  }

  loadPrefs();
  fillCourses();
  fillGroups();
  savePrefs();

  state.pickedWeekType = getWeekType(new Date());

  const cs = $("courseSelect");
  const gs = $("groupSelect");
  if (cs) cs.onchange = e => { state.course = Number(e.target.value); fillGroups(); savePrefs(); renderAll(); };
  if (gs) gs.onchange = e => { state.group = e.target.value; savePrefs(); renderAll(); };

  setupDownload();
  setupImport();
  setupReset();
  setupSearch();

  renderAll();
  setInterval(renderTodayBlock, 60000);
}

setInterval(() => {
  const el = $("clock");
  if (el) el.textContent = new Date().toLocaleString("ru-RU", {
    weekday: "short", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}, 1000);

init();
