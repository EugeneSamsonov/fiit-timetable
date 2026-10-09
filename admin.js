// ============================================================
//  admin.js — редактор расписания
//  Загружает timetable.json, сохраняет правки в localStorage.
// ============================================================

const DAY_NAMES = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
const DAY_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const PAIRS = [
  { start:"08:30", end:"10:05" },
  { start:"10:15", end:"11:50" },
  { start:"12:20", end:"13:55" },
  { start:"14:10", end:"15:20" },
  { start:"15:30", end:"16:40" },
  { start:"16:50", end:"17:40" },
];

const LS_COURSE   = "sched.course";
const LS_GROUP    = "sched.group";
const LS_OVERRIDE = "sched.override";

const state = {
  base: null,
  override: null,
  course: null,
  group: null,
  week: 1,
  day: 0,
};

function data(){ return state.override || state.base; }
function $(id){ return document.getElementById(id); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }

// ============================================================
//  Загрузка timetable.json
// ============================================================
async function loadBase(){
  if(location.protocol === "file:"){
    throw new Error(
      "Сайт открыт через file://. Запустите локальный сервер: " +
      "python3 -m http.server 8000 — и откройте http://localhost:8000"
    );
  }
  const res = await fetch("timetable.json?v=" + Date.now(), { cache: "no-store" });
  if(!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  if(!json || !json[1] || !json[2]) throw new Error("Неверный формат timetable.json");
  return json;
}

// ============================================================
//  localStorage
// ============================================================
function loadPrefs(){
  try{
    const c = Number(localStorage.getItem(LS_COURSE));
    const g = localStorage.getItem(LS_GROUP);
    const ov = localStorage.getItem(LS_OVERRIDE);
    if(c) state.course = c;
    if(g) state.group = g;
    if(ov) state.override = JSON.parse(ov);
  }catch(e){}
}

function savePrefs(){
  try{
    if(state.course) localStorage.setItem(LS_COURSE, String(state.course));
    if(state.group)  localStorage.setItem(LS_GROUP, state.group);
  }catch(e){}
}

function persist(){
  localStorage.setItem(LS_OVERRIDE, JSON.stringify(state.override));
}

// ============================================================
//  Селекторы курса/группы
// ============================================================
function fillCourses(){
  const cs = $("courseSelect");
  if(!cs) return;
  cs.innerHTML = "";
  const all = new Set();
  for(const day of Object.values(data()[1] || {})){
    Object.keys(day).forEach(c=>all.add(Number(c)));
  }
  const courses = [...all].sort((a,b)=>a-b);
  courses.forEach(c=>{
    const o = document.createElement("option");
    o.value = c; o.textContent = c + " курс";
    cs.appendChild(o);
  });
  state.course = state.course && courses.includes(state.course) ? state.course : courses[0];
  cs.value = state.course;
}

function fillGroups(){
  const gs = $("groupSelect");
  if(!gs) return;
  gs.innerHTML = "";
  const set = new Set();
  for(const wt of [1,2]){
    for(const day of Object.values(data()[wt] || {})){
      if(day[state.course]) Object.keys(day[state.course]).forEach(g=>set.add(g));
    }
  }
  const groups = [...set];
  groups.forEach(g=>{
    const o = document.createElement("option");
    o.value = g; o.textContent = g;
    gs.appendChild(o);
  });
  state.group = state.group && groups.includes(state.group) ? state.group : groups[0];
  gs.value = state.group;
}

// ============================================================
//  Работа с расписанием
// ============================================================
function getLessonsArr(week, day, course, group){
  const sheet = data();
  if(!sheet[week]) sheet[week] = {};
  if(!sheet[week][day]) sheet[week][day] = {};
  if(!sheet[week][day][course]) sheet[week][day][course] = {};
  if(!sheet[week][day][course][group]) sheet[week][day][course][group] = [];
  return sheet[week][day][course][group];
}

function ensureOverride(){
  if(!state.override){
    state.override = clone(state.base);
  }
}

// ============================================================
//  Рендер
// ============================================================
function renderWeekButtons(){
  const w1 = $("weekBtn1"), w2 = $("weekBtn2");
  if(!w1 || !w2) return;
  w1.classList.toggle("active", state.week === 1);
  w2.classList.toggle("active", state.week === 2);
  w1.onclick = ()=>{ state.week = 1; renderAll(); };
  w2.onclick = ()=>{ state.week = 2; renderAll(); };
}

function renderDayTabs(){
  const tabs = $("dayTabs");
  if(!tabs) return;
  tabs.innerHTML = "";
  const today = new Date();
  const todayIdx = (today.getDay()+6)%7;

  for(let i=0;i<7;i++){
    const arr =
      state.override?.[state.week]?.[DAY_NAMES[i]]?.[state.course]?.[state.group] ??
      state.base?.[state.week]?.[DAY_NAMES[i]]?.[state.course]?.[state.group] ??
      [];
    const has = arr.length > 0;
    const b = document.createElement("button");
    b.innerHTML = `${DAY_SHORT[i]}<span class="dnum">${DAY_NAMES[i].slice(0,2)}</span>`;
    if(i === todayIdx) b.classList.add("today");
    if(i === state.day) b.classList.add("active");
    if(!has) b.classList.add("disabled");
    b.onclick = ()=>{ state.day = i; renderAll(); };
    tabs.appendChild(b);
  }
}

function renderEditor(){
  const el = $("editor");
  if(!el) return;
  el.innerHTML = "";

  const dayName = DAY_NAMES[state.day];
  ensureOverride();
  const arr = getLessonsArr(state.week, dayName, state.course, state.group);

  const title = document.createElement("div");
  title.className = "section-title";
  title.innerHTML = `<span class="dot"></span>${dayName} · ${state.course} курс · ${state.group}`;
  el.appendChild(title);

  for(let p=1; p<=6; p++){
    const lesson = arr.find(x => x.p === p);
    const row = document.createElement("div");
    row.className = "edit-row";
    const time = PAIRS[p-1];
    row.innerHTML = `
      <div class="edit-pair">${p}</div>
      <div class="edit-time">${time.start}–${time.end}</div>
      <textarea class="edit-text" rows="2" placeholder="Нет пары">${lesson ? escapeHtml(lesson.t) : ""}</textarea>
      <button class="edit-clear" title="Очистить">✕</button>
    `;
    const ta  = row.querySelector("textarea");
    const btn = row.querySelector(".edit-clear");

    ta.addEventListener("input", ()=>{
      const txt = ta.value.trim();
      const idx = arr.findIndex(x => x.p === p);
      if(txt){
        if(idx >= 0){ arr[idx].t = txt; }
        else{ arr.push({ p, t: txt }); }
      } else {
        if(idx >= 0) arr.splice(idx, 1);
      }
      persist();
    });

    btn.onclick = ()=>{
      ta.value = "";
      const idx = arr.findIndex(x => x.p === p);
      if(idx >= 0) arr.splice(idx, 1);
      persist();
      renderDayTabs();
    };

    el.appendChild(row);
  }
}

function renderAll(){
  renderWeekButtons();
  renderDayTabs();
  renderEditor();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ============================================================
//  Инициализация
// ============================================================
async function init(){
  try{
    state.base = await loadBase();
  }catch(e){
    $("editor").innerHTML =
      '<div class="empty">Не удалось загрузить расписание.<br><br>' +
      escapeHtml(e.message) + '</div>';
    return;
  }

  loadPrefs();
  fillCourses();
  fillGroups();
  savePrefs();

  $("courseSelect").onchange = e=>{
    state.course = Number(e.target.value);
    fillGroups(); savePrefs(); renderAll();
  };
  $("groupSelect").onchange = e=>{
    state.group = e.target.value;
    savePrefs(); renderAll();
  };

  $("downloadBtn").onclick = ()=>{
    const payload = state.override || state.base;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    a.download = "schedule_" + d.getFullYear()
      + String(d.getMonth()+1).padStart(2,"0")
      + String(d.getDate()).padStart(2,"0") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  $("applyBtn").onclick = ()=>{
    persist();
    alert("Расписание применено. Переход на главную.");
    location.href = "index.html";
  };

  renderAll();
}

init();
