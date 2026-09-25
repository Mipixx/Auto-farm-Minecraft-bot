# Auto-farm Minecraft Bot

Бот на [Mineflayer](https://github.com/PrismarineJS/mineflayer) для **Minecraft Java 26.1**.  
Сам ведёт пшеничную ферму: сеет, растит костной мукой, жнёт и отдаёт урожай игроку.

Репозиторий: [Mipixx/Auto-farm-Minecraft-bot](https://github.com/Mipixx/Auto-farm-Minecraft-bot)

---

## Что делает бот

1. Подбирает **костную муку** с пола  
2. Забирает муку из **полной компостицы**  
3. Подбирает семена и пшеницу с фермы  
4. Засевает все свободные **пашни**  
5. Кидает лишние семена в **компостер** (оставляет запас на посадку)  
6. Ускоряет рост пшеницы **костной мукой**  
7. Жнёт зрелую пшеницу и сразу пересаживает  
8. Отдаёт ближайшему игроку пшеницу **только пачками по 16**

Дополнительно:
- не подбирает обратно пшеницу, которую только что скинул игроку  
- если дроп далеко / недостижим — скипает и не зависает  
- если игрока рядом нет — копит пшеницу и продолжает ферму  
- при дисконнекте переподключается сам  

---

## Требования

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- Minecraft **26.1**
- Сервер или мир с **Open to LAN** (offline)
- Рядом: грядки, семена, компостер, немного костной муки на старт

> `node_modules` в репозиторий не входят. Их ставит `npm install`.

---

## Установка

### Linux

```bash
git clone https://github.com/Mipixx/Auto-farm-Minecraft-bot.git
cd Auto-farm-Minecraft-bot
npm install
chmod +x start.sh
```

### Windows

```bat
git clone https://github.com/Mipixx/Auto-farm-Minecraft-bot.git
cd Auto-farm-Minecraft-bot
npm install
```

Проверка Node:

```bash
node -v
```

Должно быть `v22` или выше.

---

## Запуск

Сначала открой мир в Minecraft (**Open to LAN** / сервер) и запомни порт.

### Linux

```bash
./start.sh
```

Свой хост и порт:

```bash
MC_HOST=127.0.0.1 MC_PORT=25565 ./start.sh
```

Или напрямую:

```bash
MC_HOST=127.0.0.1 MC_PORT=25565 node bot.js
```

### Windows (PowerShell)

```powershell
node bot.js
```

С настройками:

```powershell
$env:MC_HOST="127.0.0.1"
$env:MC_PORT="25565"
$env:MC_USERNAME="Farmer"
$env:MC_AUTH="offline"
$env:MC_VERSION="26.1"
node bot.js
```

### Windows (CMD)

```bat
set MC_HOST=127.0.0.1
set MC_PORT=25565
set MC_USERNAME=Farmer
set MC_AUTH=offline
set MC_VERSION=26.1
node bot.js
```

На Windows используй `node bot.js` — скрипт `start.sh` только для Linux/macOS.

---

## Настройки (переменные окружения)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `MC_HOST` | `localhost` | IP / хост |
| `MC_PORT` | `25565` | Порт сервера или LAN |
| `MC_USERNAME` | `Farmer` | Ник бота |
| `MC_AUTH` | `offline` | `offline` или `microsoft` |
| `MC_VERSION` | `26.1` | Версия Minecraft |
| `FARM_RANGE` | `48` | Радиус работы |
| `SEED_RESERVE` | `16` | Сколько семян оставлять на посадку |

---

## Команды в чате

| Команда | Действие |
|---|---|
| `stop farm` | Остановить ферму |
| `start farm` | Снова запустить |

---

## Как пользоваться

1. Поставь грядки с пшеницей  
2. Поставь **компостер** рядом  
3. Дай боту семена и немного костной муки  
4. Встань рядом — бот будет кидать тебе пшеницу по 16  
5. Запусти бота командами выше  

---

## Структура проекта

```
Auto-farm-Minecraft-bot/
├── bot.js              # логика бота
├── start.sh            # запуск (Linux)
├── package.json        # зависимости
├── package-lock.json
└── README.md
```

Зависимости:
- `mineflayer` (с GitHub — поддержка 26.1)
- `mineflayer-pathfinder`

---

## Проблемы

**`ECONNREFUSED`** — сервер/LAN не запущен или неверный порт.  
**`Server version is not supported`** — нужен Node 22+ и `npm install` из этого репо.  
**Бот зашёл, но стоит** — нет грядок / семян / компостера в радиусе, или ты слишком далеко.  
**Не отдаёт пшеницу** — нужно минимум 16 штук в инвентаре и игрок в зоне видимости.

---

## Лицензия

ISC
