// ============================================================
//  Константы
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

const WEEKS = [
  {type:1,start:"01.09",end:"06.09"},{type:2,start:"07.09",end:"13.09"},
  {type:1,start:"14.09",end:"20.09"},{type:2,start:"21.09",end:"27.09"},
  {type:1,start:"28.09",end:"04.10"},{type:2,start:"05.10",end:"11.10"},
  {type:1,start:"12.10",end:"18.10"},{type:2,start:"19.10",end:"25.10"},
  {type:1,start:"26.10",end:"01.11"},{type:2,start:"02.11",end:"08.11"},
  {type:1,start:"09.11",end:"15.11"},{type:2,start:"16.11",end:"22.11"},
  {type:1,start:"23.11",end:"29.11"},{type:2,start:"30.11",end:"06.12"},
  {type:1,start:"07.12",end:"13.12"},{type:2,start:"14.12",end:"20.12"},
  {type:1,start:"21.12",end:"27.12"},{type:2,start:"28.12",end:"30.12"},
];

const LS_COURSE = "sched.course";
const LS_GROUP  = "sched.group";

// ============================================================
//  Состояние
// ============================================================
const state = {
  data: null,
  course: null,
  group: null,
  pickedDayIndex: (new Date().getDay()+6)%7,
  pickedWeekType: 1,
};

// ============================================================
//  Даты / утилиты
// ============================================================
function startOfWeek(d){
  d = new Date(d); d.setHours(0,0,0,0);
  const iso = (d.getDay()+6)%7;
  d.setDate(d.getDate()-iso);
  return d;
}
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isSameDay(a,b){
  return a.getFullYear()===b.getFullYear()
      && a.getMonth()===b.getMonth()
      && a.getDate()===b.getDate();
}
function fmtDate(d){
  const dd=String(d.getDate()).padStart(2,"0");
  const mm=String(d.getMonth()+1).padStart(2,"0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}
function parseDDMM(s,year){
  const [dd,mm]=s.split(".").map(Number);
  return new Date(year,mm-1,dd);
}
function toMin(t){ const [h,m]=t.split(":").map(Number); return h*60+m; }

function getWeekType(date){
  const y = date.getFullYear();
  for(const w of WEEKS){
    const s = parseDDMM(w.start, y);
    const e = parseDDMM(w.end, y);
    if(date >= s && date <= e) return w.type;
  }
  const first = parseDDMM("01.09", y);
  const idx = Math.floor((startOfWeek(date)-startOfWeek(first))/86400000/7);
  return (idx%2===0)?1:2;
}

// ============================================================
//  НОРМАЛИЗАЦИЯ ТЕКСТА ПАРЫ
//  Проблема: в XLSX "Ф И З К У Л Ь Т У Р А" — буквы через пробел.
//  Решение: если 5+ одиночных заглавных букв через пробел — склеиваем.
// ============================================================
function normalizeText(raw){
  if(!raw) return "";
  let s = String(raw);

  // 1) Склеиваем "Ф И З К У Л Ь Т У Р А" → "ФИЗКУЛЬТУРА"
  //    Общий случай: 4+ одиночных символа (кириллица/латиница) через пробелы
  s = s.replace(
    /(?:^|\s)((?:[А-ЯЁA-Z]\s+){3,}[А-ЯЁA-Z])(?=\s|$|[.,;:])/g,
    (m, letters) => " " + letters.replace(/\s+/g,"")
  );

  // 2) Убираем двойные пробелы, лишние разделители
  s = s.replace(/\s{2,}/g," ").trim();

  // 3) Убираем висячие ; и ,
  s = s.replace(/^[;,.\s]+|[;,\s]+$/g,"");

  return s;
}

function isFitness(text){
  return /ФИЗКУЛЬТУРА/i.test(text);
}

// ============================================================
//  Извлечение пар
// ============================================================
function extractLessons(weekType, course, group, dayIndex){
  const dayName = DAY_NAMES[dayIndex];
  const sheet = state.data?.[weekType];
  if(!sheet) return [];
  const byDay = sheet[dayName];
  if(!byDay) return [];
  const byCourse = byDay[course];
  if(!byCourse) return [];
  const arr = byCourse[group];
  if(!arr) return [];

  return arr
    .slice()
    .sort((a,b)=>a.p-b.p)
    .map(x=>{
      const txt = normalizeText(x.t);
      return {
        pairNum: x.p,
        start: PAIRS[x.p-1].start,
        end:   PAIRS[x.p-1].end,
        text:  txt,
        fitness: isFitness(txt),
      };
    })
    .filter(x => x.text.length > 0);
}

// ============================================================
//  Рендер
// ============================================================
function $(id){ return document.getElementById(id); }

function renderSubtitle(){
  if(!state.course || !state.group){ $("subtitle").textContent="—"; return; }
  const wt = getWeekType(new Date());
  $("subtitle").textContent =
    `${state.course} курс · ${state.group} · сейчас ${wt} неделя`;
}

function renderLessonCard(lesson, mode){
  const el = document.createElement("div");
  el.className = "lesson";
  if(mode==="current") el.classList.add("current");
  if(mode==="next")    el.classList.add("next");
  if(mode==="past")    el.classList.add("past");
  if(lesson.fitness)   el.classList.add("fitness");

  let badge = "";
  if(mode==="current") badge = '<span class="badge green">сейчас</span>';
  else if(mode==="next") badge = '<span class="badge orange">следующая</span>';

  // Аудитория — в конце строки
  const text = lesson.text;
  const roomMatch = text.match(/(?:^|\s)([0-9]{1,2}\.[0-9]{1,2}|[0-9]{3}\s*ЭФ|ВЦ|МИЦ|ПО|планет|Спортзал)\s*$/i);
  let body = text, room = "";
  if(roomMatch){
    room = roomMatch[1];
    body = text.slice(0, roomMatch.index).trim().replace(/[;,]\s*$/,"");
  }

  el.innerHTML = `
    <div class="head">
      <span class="num">${lesson.pairNum}</span>
      <span class="time">${lesson.start}–${lesson.end}</span>
      ${badge}
    </div>
    <div class="body">${escapeHtml(body)}</div>
    ${room ? `<div class="room">📍 ${escapeHtml(room)}</div>` : ""}
  `;
  return el;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// ---------- Блок "Сегодня / Завтра" ----------
function renderTodayBlock(){
  const main = $("content");
  main.innerHTML = "";

  if(!state.data || !state.course || !state.group){
    main.innerHTML = '<div class="empty">Загрузка…</div>';
    return;
  }

  const now = new Date();
  const today = new Date(now);
  const di = (today.getDay()+6)%7;
  const wt = getWeekType(today);
  const todayLessons = extractLessons(wt, state.course, state.group, di);
  const lastEnd = todayLessons.length ? Math.max(...todayLessons.map(l=>toMin(l.end))) : 0;
  const curMin = now.getHours()*60 + now.getMinutes();

  const showTomorrow = todayLessons.length === 0 || curMin > lastEnd;

  let date = today, dayIndex = di, weekType = wt, mode = "today";
  if(showTomorrow){
    date = addDays(today, 1);
    dayIndex = (date.getDay()+6)%7;
    weekType = getWeekType(date);
    mode = "tomorrow";
  }

  const lessons = extractLessons(weekType, state.course, state.group, dayIndex);

  const h = document.createElement("div");
  h.className = "section-title " + (mode==="today" ? "today-label" : "tomorrow-label");
  const label = mode==="today" ? "Сегодня" : "Завтра";
  h.innerHTML = `<span class="dot"></span>${label} · ${DAY_NAMES[dayIndex]}, ${fmtDate(date)}`;
  main.appendChild(h);

  if(!lessons.length){
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = mode==="today"
      ? "Сегодня занятий нет 🎉"
      : "Завтра занятий нет 🎉";
    main.appendChild(e);
    return;
  }

  let currentLesson=null, nextLesson=null;
  if(mode==="today"){
    const curMin2 = now.getHours()*60 + now.getMinutes();
    for(const l of lessons){
      if(curMin2 >= toMin(l.start) && curMin2 <= toMin(l.end)) currentLesson = l;
    }
    const upcoming = lessons
      .filter(l => toMin(l.start) > curMin2)
      .sort((a,b)=>toMin(a.start)-toMin(b.start));
    nextLesson = upcoming[0] || null;
  }

  lessons.forEach(l=>{
    let lm = "future";
    if(l === currentLesson) lm = "current";
    else if(l === nextLesson) lm = "next";
    else if(mode==="today" && toMin(l.end) < curMin) lm = "past";
    main.appendChild(renderLessonCard(l, lm));
  });
}

// ---------- Блок "Другой день" ----------
function renderPickedBlock(){
  const picked = $("pickedContent");
  if(!picked) return;
  picked.innerHTML = "";

  if(!state.data || !state.course || !state.group) return;

  const lessons = extractLessons(state.pickedWeekType, state.course, state.group, state.pickedDayIndex);

  if(!lessons.length){
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "В этот день занятий нет";
    picked.appendChild(e);
    return;
  }
  lessons.forEach(l => picked.appendChild(renderLessonCard(l, "future")));
}

function renderDayTabs(){
  const tabs = $("dayTabs");
  if(!tabs) return;
  tabs.innerHTML = "";
  const today = new Date();
  const todayIdx = (today.getDay()+6)%7;

  for(let i=0;i<7;i++){
    const b = document.createElement("button");
    b.innerHTML = `${DAY_SHORT[i]}<span class="dnum">${DAY_NAMES[i].slice(0,2)}</span>`;
    if(i===todayIdx) b.classList.add("today");
    if(i===state.pickedDayIndex) b.classList.add("active");
    if(i>=5) b.classList.add("weekend");
    b.onclick = ()=>{
      state.pickedDayIndex = i;
      renderDayTabs();
      renderPickedBlock();
    };
    tabs.appendChild(b);
  }
}

function renderWeekToggle(){
  const b = $("weekToggle");
  if(!b) return;
  b.textContent = "Неделя: " + state.pickedWeekType;
  b.classList.toggle("w2", state.pickedWeekType === 2);
}

function renderAll(){
  renderSubtitle();
  renderTodayBlock();
  renderWeekToggle();
  renderDayTabs();
  renderPickedBlock();
}

// ============================================================
//  Селекторы + localStorage
// ============================================================
function loadPrefs(){
  try{
    const c = Number(localStorage.getItem(LS_COURSE));
    const g = localStorage.getItem(LS_GROUP);
    if(c) state.course = c;
    if(g) state.group = g;
  }catch(e){}
}
function savePrefs(){
  try{
    if(state.course) localStorage.setItem(LS_COURSE, String(state.course));
    if(state.group)  localStorage.setItem(LS_GROUP, state.group);
  }catch(e){}
}

function fillCourses(){
  const cs = $("courseSelect");
  cs.innerHTML = "";
  const all = new Set();
  for(const day of Object.values(state.data[1])){
    Object.keys(day).forEach(c=>all.add(Number(c)));
  }
  const courses = [...all].sort((a,b)=>a-b);
  courses.forEach(c=>{
    const o=document.createElement("option");
    o.value=c; o.textContent = c+" курс";
    cs.appendChild(o);
  });
  state.course = state.course && courses.includes(state.course) ? state.course : courses[0];
  cs.value = state.course;
}

function fillGroups(){
  const gs = $("groupSelect");
  gs.innerHTML = "";
  const set = new Set();
  for(const wt of [1,2]){
    for(const day of Object.values(state.data[wt])){
      if(day[state.course]) Object.keys(day[state.course]).forEach(g=>set.add(g));
    }
  }
  const groups = [...set];
  groups.forEach(g=>{
    const o=document.createElement("option");
    o.value=g; o.textContent=g;
    gs.appendChild(o);
  });
  state.group = state.group && groups.includes(state.group) ? state.group : groups[0];
  gs.value = state.group;
}

// ============================================================
//  Инициализация
// ============================================================
function init(){
  state.data = window.SCHEDULE_DATA;
  if(!state.data){
    $("content").innerHTML =
      '<div class="empty">Не найден data.js. Запустите build.js</div>';
    return;
  }

  loadPrefs();
  fillCourses();
  fillGroups();
  savePrefs();

  state.pickedWeekType = getWeekType(new Date());

  $("courseSelect").onchange = e=>{
    state.course = Number(e.target.value);
    fillGroups();
    savePrefs();
    renderAll();
  };
  $("groupSelect").onchange = e=>{
    state.group = e.target.value;
    savePrefs();
    renderAll();
  };

  const wt = $("weekToggle");
  if(wt){
    wt.onclick = ()=>{
      state.pickedWeekType = state.pickedWeekType === 1 ? 2 : 1;
      renderWeekToggle();
      renderPickedBlock();
    };
  }

  renderAll();
  setInterval(renderTodayBlock, 60000);
}

setInterval(()=>{
  const el = $("clock");
  if(el) el.textContent = new Date().toLocaleString("ru-RU",{
    weekday:"short", day:"2-digit", month:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit"
  });
},1000);

init();
