// ============================================================
//  build.js v5 — финальные фиксы:
//   1) endCol курса не захватывает "день"/"№" следующего курса
//   2) день недели ищется во ВСЕХ dayCol курсов (для 2 недели)
//   3) направление "1п/г" не склеивается с "ИСиП"
// ============================================================

const XLSX = require("xlsx");
const fs = require("fs");

const SRC = "schedule.xlsx";
const DEST = "data.js";

const DAY_NAMES = [
  "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"
];
const REFKEY = "!ref";
const MERGEKEY = "!merges";

function raw(ws, r, c) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  if (!cell) return "";
  const v = cell.w != null ? cell.w : cell.v;
  return v == null ? "" : String(v).replace(/\s+/g, " ").trim();
}

function makeMergeMap(ws) {
  const mm = new Map();
  for (const m of (ws[MERGEKEY] || [])) {
    const v = raw(ws, m.s.r, m.s.c);
    if (!v) continue;
    for (let R = m.s.r; R <= m.e.r; R++)
      for (let C = m.s.c; C <= m.e.c; C++)
        mm.set(R + "," + C, v);
  }
  return mm;
}


// ---- Парсер подгрупп ----
// Разбивает "Комп сети 1п/г Магомедова М.Г. МИЦ; Проектир ПО 2п/г Рабаданова Р.М. 2.10"
// на [{sub, subject, teacher, room}, ...]
function parseSubgroups(text){
  if(!text) return null;
  const s = String(text);
  if(!/\d+п\/г/.test(s)) return null;

  const parts = s.split(/\s*;\s*/);
  const out = [];

  for(const p of parts){
    if(!p.trim()) continue;

    const m = p.match(/^(.*?)\s*(\d+п\/г)\s*(.*)$/);
    if(!m) continue;

    const prefix = m[1].trim();      // ← "БД", "Ин.яз" (предмет до 1п/г)
    const sub    = m[2];             // ← "1п/г"
    let rest     = m[3].trim();      // ← "Шахбанова З.И. 2.3"

    // 1. Аудитория с конца
    let room = "";
    const roomRe = /\s([0-9]{1,2}\.[0-9]{1,2}|[0-9]{3}\s*ЭФ|ВЦ|МИЦ|ПО|планет|Спортзал)$/i;
    const rm = rest.match(roomRe);
    if(rm){
      room = rm[1].trim();
      rest = rest.slice(0, rest.length - rm[0].length).trim();
    }

    // 2. Преподаватель с конца
    let teacher = "";
    const teachRe1 = /(?:^|\s)([А-ЯЁ][а-яёА-ЯЁ\-]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.)$/;
    const teachRe2 = /(?:^|\s)([А-ЯЁ][а-яёА-ЯЁ\-]+\s+[А-ЯЁ]\.\s*[А-ЯЁ])$/;
    const teachRe3 = /(?:^|\s)([А-ЯЁ][а-яёА-ЯЁ\-]+\s+[А-ЯЁ]\.?)$/;

    let tm = rest.match(teachRe1) || rest.match(teachRe2) || rest.match(teachRe3);
    if(tm){
      teacher = tm[1].trim();
      rest = rest.slice(0, tm.index).trim();
    }

    // 3. Если остался хвост "ПО"/"МИЦ" и room пуст
    if(!room){
      const tailRoom = /\s([0-9]{1,2}\.[0-9]{1,2}|[0-9]{3}\s*ЭФ|ВЦ|МИЦ|ПО|планет|Спортзал)$/i;
      const tr = rest.match(tailRoom);
      if(tr){
        room = tr[1].trim();
        rest = rest.slice(0, rest.length - tr[0].length).trim();
      }
    }

    // 4. Если teacher всё ещё пуст — последняя попытка
    if(!teacher){
      const t2 = rest.match(/\s([А-ЯЁ][а-яёА-ЯЁ\-]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.?)$/);
      if(t2){
        teacher = t2[1].trim();
        rest = rest.slice(0, t2.index).trim();
      }
    }

    // 5. ПРЕДМЕТ = prefix (то, что было до 1п/г), либо остаток rest
    let subject = prefix;
    if(!subject){
      subject = rest.replace(/^[;,.·\s]+|[;,.·\s]+$/g, "").trim();
    }

    out.push({ sub, subject, teacher, room });
  }

  return out.length ? out : null;
}


function normalize(rawText) {
  if (rawText == null) return "";
  let s = String(rawText);
  s = s.replace(
    /(?:^|\s)((?:[А-ЯЁA-Z]\s+){3,}[А-ЯЁA-Z])(?=\s|$|[.,;:])/g,
    (_, letters) => " " + letters.replace(/\s+/g, "")
  );
  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^[;,.·\s]+|[;,.·\s]+$/g, "");
  return s;
}

function toDayName(s) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  for (const d of DAY_NAMES) if (s === d) return d;
  return null;
}

function parseSheet(ws) {
  const ref = XLSX.utils.decode_range(ws[REFKEY]);
  const getMerge = makeMergeMap(ws);
  const get = (r, c) => {
    const v = getMerge.get(r + "," + c);
    return v != null ? v : raw(ws, r, c);
  };

  // ---- 1. Строка курсов ----
  let courseRow = -1;
  for (let r = ref.s.r; r <= ref.e.r && courseRow === -1; r++) {
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      if (/^\d\s*КУРС$/i.test(raw(ws, r, c))) { courseRow = r; break; }
    }
  }
  if (courseRow === -1) return null;

  // ---- 2. Собираем стартовые колонки курсов ----
  const starters = [];
  for (let c = ref.s.c; c <= ref.e.c; c++) {
    const v = raw(ws, courseRow, c);
    const m = v.match(/^(\d)\s*КУРС$/i);
    if (m) starters.push({ num: +m[1], col: c });
  }

  // ---- 3. Определяем dayCol/pairCol для каждого курса ----
  //      Ищем СЛЕВА от startCol, но не заходя за предыдущий курс.
  const curCols = starters.map((s, i) => {
    const leftBound = (i > 0) ? starters[i - 1].col : ref.s.c;
    let dayCol = -1, pairCol = -1;
    for (let cc = s.col - 1; cc >= leftBound; cc--) {
      const v = raw(ws, courseRow, cc);
      if (dayCol === -1 && /^день$/i.test(v)) dayCol = cc;
      if (pairCol === -1 && /^№$/i.test(v)) pairCol = cc;
      if (dayCol !== -1 && pairCol !== -1) break;
    }
    if (pairCol === -1) pairCol = s.col - 1;
    if (dayCol === -1) dayCol = s.col - 2;
    return { num: s.num, startCol: s.col, dayCol, pairCol, endCol: s.col };
  });

  // ---- 4. endCol = следующий startCol − 3 (пропустить «день» и «№») ----
  //      Если между курсами идёт [день][№][N КУРС], это два шага назад.
  //      Но чтобы не гадать — просто ищем следующее "N КУРС" в СЫРОМ виде.
  for (let i = 0; i < curCols.length; i++) {
    if (i + 1 < curCols.length) {
      // граница — колонка следующего курса − 1, но если перед этим курсом
      // идут dayCol и pairCol, обрезаем их тоже.
      const next = curCols[i + 1];
      let end = next.startCol - 1;
      // если в колонке end стоит "№" следующего курса — минус 1
      // если в end-1 стоит "день" следующего курса — минус ещё 1
      // проще: end = следующий dayCol - 1
      if (next.dayCol > 0) end = Math.min(end, next.dayCol - 1);
      // не заходим ниже startCol
      curCols[i].endCol = Math.max(end, curCols[i].startCol);
    } else {
      curCols[i].endCol = ref.e.c;
    }
  }

  // ---- 5. Строка направлений ----
  let groupRow = -1;
  for (let r = courseRow + 1; r <= Math.min(courseRow + 6, ref.e.r); r++) {
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      if (raw(ws, r, c) === "ИСиП") { groupRow = r; break; }
    }
    if (groupRow !== -1) break;
  }
  if (groupRow === -1) groupRow = courseRow + 1;
  const nameRow = groupRow - 1 >= 0 ? groupRow - 1 : groupRow;

  const groupCols = {};
  for (const cc of curCols) {
    const map = {};
    for (let c = cc.startCol; c <= cc.endCol; c++) {
      const g = raw(ws, groupRow, c);
      if (!g || g.length > 40) continue;
      if (/^день$|^№$/i.test(g)) continue;
      if (/^\d+гр$/i.test(g)) continue;
      // объединяем "ИСиП 1п/г" с "ИСиП" — оставляем как есть
      if (map[g] === undefined) map[g] = c;
    }
    if (!Object.keys(map).length) {
      for (let c = cc.startCol; c <= cc.endCol; c++) {
        const g = raw(ws, nameRow, c);
        if (!g || g.length > 40) continue;
        if (/^день$|^№$/i.test(g)) continue;
        if (map[g] === undefined) map[g] = c;
      }
    }
    if (!Object.keys(map).length) map["—"] = cc.startCol;
    groupCols[cc.num] = map;
  }

  // ---- 6. Дни недели. Ищем во ВСЕХ dayCol курсов ----
  const dayBlocks = [];
  for (let r = courseRow + 1; r <= ref.e.r; r++) {
    let foundDay = null;
    for (const cc of curCols) {
      const d = toDayName(raw(ws, r, cc.dayCol));
      if (d) { foundDay = d; break; }
    }
    if (!foundDay) continue;
    // защита от повторного чтения того же дня (merge)
    const last = dayBlocks[dayBlocks.length - 1];
    if (last && last.name === foundDay) continue;
    dayBlocks.push({ name: foundDay, startRow: r });
  }
  for (let i = 0; i < dayBlocks.length; i++) {
    dayBlocks[i].endRow = (i + 1 < dayBlocks.length)
      ? dayBlocks[i + 1].startRow - 1
      : ref.e.r;
  }

  // ---- 7. Сбор пар ----
  const out = {};
  for (const blk of dayBlocks) {
    out[blk.name] = {};
    for (const cc of curCols) {
      out[blk.name][cc.num] = {};
      for (const [group, col] of Object.entries(groupCols[cc.num])) {
        const arr = [];
        const seen = new Set();
        for (let r = blk.startRow; r <= blk.endRow; r++) {
          const pn = Number(raw(ws, r, cc.pairCol));
          if (!pn || pn < 1 || pn > 6) continue;
          if (seen.has(pn)) continue;
          const txt = normalize(get(r, col));
          if (!txt) continue;
          if (/^\d+$/.test(txt)) continue;
          if (/^(день|№|время)$/i.test(txt)) continue;
          seen.add(pn);
          arr.push({ p: pn, t: txt, subgroups: parseSubgroups(txt) || undefined });
        }
        out[blk.name][cc.num][group] = arr;
      }
    }
  }

  // ---- Диагностика ----
  console.log("  курсы: [" + curCols.map(c => c.num).join(", ") + "]");
  for (const cc of curCols) {
    console.log(`     ${cc.num}: start=${cc.startCol} end=${cc.endCol} dayCol=${cc.dayCol} pairCol=${cc.pairCol}`);
    console.log(`        направления: ${Object.keys(groupCols[cc.num]).join(", ")}`);
  }
  console.log("  дней: " + dayBlocks.length + " (" + dayBlocks.map(d => d.name).join(", ") + ")");

  return out;
}

(function main() {
  if (!fs.existsSync(SRC)) { console.error("нет " + SRC); process.exit(1); }
  const wb = XLSX.readFile(SRC, { cellText: true, cellDates: false });
  const result = { 1: {}, 2: {} };

  for (const [name, week] of [["1неделя", 1], ["2неделя", 2]]) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    console.log("лист " + name);
    const parsed = parseSheet(ws);
    if (parsed) result[week] = parsed;
  }

    fs.writeFileSync(
    "timetable.json",
    JSON.stringify(result, null, 2)
  );

  for (const w of [1, 2]) {
    let total = 0;
    for (const day of Object.values(result[w]))
      for (const c of Object.values(day))
        for (const a of Object.values(c)) total += a.length;
    console.log("неделя " + w + ": " + total + " пар");
  }
  console.log("готово: timetable.json");
})();
