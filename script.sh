#!/usr/bin/env bash
# cleanup.sh — приводит папку проекта в порядок:
#   • удаляет бэкапы, node_modules, служебные файлы
#   • оставляет только нужное для работы и разработки
#   • создаёт .gitignore и README.md
#
# Запуск: bash cleanup.sh
# С флагом --hard — удалит ВСЁ, кроме исходников и dist/:
#   bash cleanup.sh --hard

set -e
HARD=0
[ "$1" = "--hard" ] && HARD=1

echo "▶ Папка: $(pwd)"
echo ""

# ---------- Что оставляем ----------
# Исходники + сборка (для разработки)
KEEP_DEV=(
  "index.html"
  "style.css"
  "app.js"
  "data.js"
  "schedule.xlsx"
  "build.js"
  "package.json"
  "package-lock.json"
  "prepare-pages.sh"
  "cleanup.sh"
  "README.md"
  ".gitignore"
)

# Только то, что нужно на GitHub Pages
KEEP_PROD=(
  "index.html"
  "style.css"
  "app.js"
  "data.js"
)

# ---------- Что удаляем ----------
rm -rf .backup_* 2>/dev/null || true
rm -rf node_modules 2>/dev/null || true
rm -f  inspect.js inspect.txt 2>/dev/null || true
rm -f  fix.sh update.sh update2.sh update3.sh update4.sh rollback.sh 2>/dev/null || true
rm -f  index.html.bak app.js.bak style.css.bak 2>/dev/null || true
rm -f  REF\ A1AR1001*.txt 2>/dev/null || true
rm -f  "node build.js.txt" 2>/dev/null || true

echo "✔ Удалены: бэкапы, node_modules, старые скрипты, диагностика"
echo ""

# ---------- .gitignore ----------
cat > .gitignore <<'EOF'
# Артефакты сборки
node_modules/
.backup_*/
dist/

# Отладочное
inspect.js
*.bak
*.tmp

# Системное
.DS_Store
Thumbs.db
EOF

echo "✔ Создан .gitignore"
echo ""

# ---------- README.md ----------
cat > README.md <<'README_EOF'
# 📅 Расписание ФИиИТ

Статический сайт с расписанием занятий факультета информатики и ИТ.
Работает на GitHub Pages, читает данные из `data.js`, без бэкенда.

## 🚀 Быстрый старт

### Что нужно
- Любой современный браузер
- (только для пересборки) Node.js 18+ и `npm`

### Посмотреть локально

Просто откройте `index.html` в браузере — никакой сервер не нужен,
`fetch` не используется, всё читается из `data.js`.

```bash
xdg-open index.html   # Linux
open index.html       # macOS
start index.html      # Windows
