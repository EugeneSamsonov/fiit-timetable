#!/usr/bin/env bash
# fix-prefix.sh — использует m[1] как subject
#
# Запуск: bash fix-prefix.sh

set -e
cd "$(dirname "$0")"

TS=$(date +%Y%m%d_%H%M%S)
cp build.js ".backup_$TS.build.js"
echo "▶ Бэкап: .backup_$TS.build.js"

node - <<'NODE_FIX'
const fs = require("fs");
let js = fs.readFileSync("build.js", "utf8");

if(!/function parseSubgroups\b/.test(js)){
  console.error("❌ нет parseSubgroups");
  process.exit(1);
}

const newFn = `function parseSubgroups(text){
  if(!text) return null;
  const s = String(text);
  if(!/\\d+п\\/г/.test(s)) return null;

  const parts = s.split(/\\s*;\\s*/);
  const out = [];

  for(const p of parts){
    if(!p.trim()) continue;

    const m = p.match(/^(.*?)\\s*(\\d+п\\/г)\\s*(.*)$/);
    if(!m) continue;

    const prefix = m[1].trim();      // ← "БД", "Ин.яз" (предмет до 1п/г)
    const sub    = m[2];             // ← "1п/г"
    let rest     = m[3].trim();      // ← "Шахбанова З.И. 2.3"

    // 1. Аудитория с конца
    let room = "";
    const roomRe = /\\s([0-9]{1,2}\\.[0-9]{1,2}|[0-9]{3}\\s*ЭФ|ВЦ|МИЦ|ПО|планет|Спортзал)$/i;
    const rm = rest.match(roomRe);
    if(rm){
      room = rm[1].trim();
      rest = rest.slice(0, rest.length - rm[0].length).trim();
    }

    // 2. Преподаватель с конца
    let teacher = "";
    const teachRe1 = /(?:^|\\s)([А-ЯЁ][а-яёА-ЯЁ\\-]+\\s+[А-ЯЁ]\\.\\s*[А-ЯЁ]\\.)$/;
    const teachRe2 = /(?:^|\\s)([А-ЯЁ][а-яёА-ЯЁ\\-]+\\s+[А-ЯЁ]\\.\\s*[А-ЯЁ])$/;
    const teachRe3 = /(?:^|\\s)([А-ЯЁ][а-яёА-ЯЁ\\-]+\\s+[А-ЯЁ]\\.?)$/;

    let tm = rest.match(teachRe1) || rest.match(teachRe2) || rest.match(teachRe3);
    if(tm){
      teacher = tm[1].trim();
      rest = rest.slice(0, tm.index).trim();
    }

    // 3. Если остался хвост "ПО"/"МИЦ" и room пуст
    if(!room){
      const tailRoom = /\\s([0-9]{1,2}\\.[0-9]{1,2}|[0-9]{3}\\s*ЭФ|ВЦ|МИЦ|ПО|планет|Спортзал)$/i;
      const tr = rest.match(tailRoom);
      if(tr){
        room = tr[1].trim();
        rest = rest.slice(0, rest.length - tr[0].length).trim();
      }
    }

    // 4. Если teacher всё ещё пуст — последняя попытка
    if(!teacher){
      const t2 = rest.match(/\\s([А-ЯЁ][а-яёА-ЯЁ\\-]+\\s+[А-ЯЁ]\\.\\s*[А-ЯЁ]\\.?)$/);
      if(t2){
        teacher = t2[1].trim();
        rest = rest.slice(0, t2.index).trim();
      }
    }

    // 5. ПРЕДМЕТ = prefix (то, что было до 1п/г), либо остаток rest
    let subject = prefix;
    if(!subject){
      subject = rest.replace(/^[;,.·\\s]+|[;,.·\\s]+$/g, "").trim();
    }

    out.push({ sub, subject, teacher, room });
  }

  return out.length ? out : null;
}`;

const start = js.indexOf("function parseSubgroups");
let i = js.indexOf("{", start);
let depth = 1, j = i + 1;
while(j < js.length && depth > 0){
  const ch = js[j];
  if(ch === "{") depth++;
  else if(ch === "}") depth--;
  j++;
}
js = js.slice(0, start) + newFn + js.slice(j);
fs.writeFileSync("build.js", js);
console.log("✔ parseSubgroups обновлён");
NODE_FIX

echo "▶ Проверяю синтаксис"
node -c build.js
echo "  ✔ ok"

echo "▶ Пересобираю"
node build.js

echo ""
echo "▶ ПРОВЕРКА:"
node -e '
const d = require("./timetable.json");
const a = d["1"]["Понедельник"]["2"]["ИСиП"];
console.log(JSON.stringify(a[0].subgroups, null, 2));
'

echo ""
echo "▶ Ещё пары:"
node -e '
const d = require("./timetable.json");
const show = (w,day,c,g,p,label) => {
  const l = (d[w]?.[day]?.[c]?.[g] || []).find(x => x.p === p);
  if(!l?.subgroups) return;
  console.log("• " + label);
  l.subgroups.forEach(sg => console.log("    " + sg.sub + " | " + sg.subject + " | " + sg.teacher + " | " + sg.room));
};
show("1","Понедельник","1","ИСиП",3,  "Ин.яз 1п/г Абдуллаева М.А. 308 ЭФ");
show("1","Понедельник","2","ИСиП",1,  "БД/Ин.яз");
show("1","Вторник","4","РПИС",3,      "МАиОИ/МиСПИСиТ");
show("1","Среда","4","РПИС",4,        "ПиРП Омарова М.А");
'

echo ""
echo "✅ Готово."
echo "Бэкап: .backup_$TS.build.js"
