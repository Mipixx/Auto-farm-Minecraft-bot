const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

const HOST = process.env.MC_HOST || 'localhost'
const PORT = Number(process.env.MC_PORT || 25565)
const USERNAME = process.env.MC_USERNAME || 'Farmer'
const AUTH = process.env.MC_AUTH || 'offline'
const VERSION = process.env.MC_VERSION || '26.1'
const RANGE = Number(process.env.FARM_RANGE || 48)
const DELIVER_STACK = 16
const SEED_RESERVE = Number(process.env.SEED_RESERVE || 16) // оставляем на посадку

let running = true
let busy = false

function createBot() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    auth: AUTH,
    version: VERSION,
  })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    const moves = new Movements(bot)
    moves.canDig = false
    bot.pathfinder.setMovements(moves)

    console.log(`[farmer] ${bot.username} online @ ${HOST}:${PORT} (${bot.version})`)
    bot.chat('фермер онлайн — пачки по 16')
    loop(bot)
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    const cmd = message.trim().toLowerCase()
    if (cmd === 'stop farm') {
      running = false
      bot.pathfinder.setGoal(null)
      bot.chat('стопаю ферму')
    } else if (cmd === 'start farm') {
      if (!running) {
        running = true
        bot.chat('ферма снова')
        loop(bot)
      }
    }
  })

  bot.on('kicked', (reason) => console.log('[farmer] kicked:', reason))
  bot.on('error', (err) => console.error('[farmer] error:', err.message))
  bot.on('end', (reason) => {
    console.log('[farmer] disconnected:', reason || 'unknown')
    console.log('[farmer] reconnect in 5s...')
    busy = false
    setTimeout(createBot, 5000)
  })

  return bot
}

async function loop(bot) {
  while (running && bot.entity) {
    if (busy) {
      await sleep(200)
      continue
    }
    busy = true
    try {
      await tick(bot)
    } catch (err) {
      console.error('[farmer] tick:', err.message)
    } finally {
      busy = false
    }
    await sleep(150)
  }
}

async function tick(bot) {
  // 1) костная мука с пола — приоритет
  if (await pickupBoneMeal(bot)) return

  // 2) забрать готовую муку из компостера (level 8)
  if (await collectComposterBoneMeal(bot)) return

  // 3) подобрать пшеницу/семена
  if (await pickupNearby(bot)) return

  // 4) засеять свободные пашни
  if (await plantAllEmptyFarmland(bot)) return

  // 5) лишние семена — в компостер
  if (await compostExtraSeeds(bot)) return

  // 6) вырастить костной мукой
  if (await applyBoneMeal(bot)) return

  // 7) сжать зрелую и сразу пересадить
  if (await harvestMatureWheat(bot)) return

  // 8) отдать игроку пачкой ровно 16
  if (await tossWheatToNearestPlayer(bot)) return
}

function countItem(bot, name) {
  return bot.inventory.items()
    .filter((i) => i.name === name)
    .reduce((sum, i) => sum + i.count, 0)
}

function nearestPlayer(bot) {
  let best = null
  let bestDist = Infinity
  for (const name in bot.players) {
    if (name === bot.username) continue
    const ent = bot.players[name]?.entity
    if (!ent) continue
    const d = bot.entity.position.distanceTo(ent.position)
    if (d < bestDist) {
      bestDist = d
      best = { entity: ent, username: name }
    }
  }
  return best
}

async function tossWheatToNearestPlayer(bot) {
  if (countItem(bot, 'wheat') < DELIVER_STACK) return false

  const wheat = bot.inventory.items().find((i) => i.name === 'wheat')
  if (!wheat) return false

  const target = nearestPlayer(bot)
  if (!target) return false

  const { entity: player, username } = target
  if (bot.entity.position.distanceTo(player.position) > 3.5) {
    await goNear(bot, player.position, 2)
  }

  const lookY = (player.height ?? 1.6) * 0.6
  const giftPos = player.position.clone()
  await bot.lookAt(player.position.offset(0, lookY, 0))
  await bot.toss(wheat.type, null, DELIVER_STACK)
  console.log(`[farmer] tossed ${DELIVER_STACK} wheat -> ${username}`)

  // не подбирать обратно то, что скинули игроку
  rememberGiftZone(giftPos)
  blacklistWheatNear(bot, giftPos, 5, 25000)
  setTimeout(() => blacklistWheatNear(bot, giftPos, 5, 20000), 400)
  setTimeout(() => blacklistWheatNear(bot, giftPos, 5, 20000), 1200)
  return true
}

const unreachableUntil = new Map() // entityId -> timestamp
const giftZones = [] // { pos, until }

function rememberGiftZone(pos, ms = 20000) {
  giftZones.push({ pos: pos.clone(), until: Date.now() + ms })
}

function pruneGiftZones() {
  const now = Date.now()
  for (let i = giftZones.length - 1; i >= 0; i--) {
    if (giftZones[i].until <= now) giftZones.splice(i, 1)
  }
}

function isGiftedDrop(pos) {
  pruneGiftZones()
  return giftZones.some((z) => pos.distanceTo(z.pos) <= 5)
}

function nearOtherPlayer(bot, pos, radius = 4.5) {
  for (const name in bot.players) {
    if (name === bot.username) continue
    const ent = bot.players[name]?.entity
    if (!ent) continue
    if (pos.distanceTo(ent.position) <= radius) return true
  }
  return false
}

function blacklistWheatNear(bot, center, radius, ms) {
  for (const e of Object.values(bot.entities)) {
    if (e.name !== 'item' && e.displayName !== 'Item' && e.displayName !== 'item') continue
    const item = typeof e.getDroppedItem === 'function' ? e.getDroppedItem() : null
    if (!item || item.name !== 'wheat') continue
    if (e.position.distanceTo(center) <= radius) markUnreachable(e.id, ms)
  }
}

function isMarkedUnreachable(id) {
  const until = unreachableUntil.get(id)
  if (until == null) return false
  if (Date.now() >= until) {
    unreachableUntil.delete(id)
    return false
  }
  return true
}

function markUnreachable(id, ms = 15000) {
  if (id == null) return
  unreachableUntil.set(id, Date.now() + ms)
}

function findDroppedItem(bot, names) {
  const want = new Set(names)
  let best = null
  let bestDist = Infinity
  for (const e of Object.values(bot.entities)) {
    if (e.name !== 'item' && e.displayName !== 'Item' && e.displayName !== 'item') continue
    if (isMarkedUnreachable(e.id)) continue
    const item = typeof e.getDroppedItem === 'function' ? e.getDroppedItem() : null
    if (!item || !want.has(item.name)) continue

    // пшеницу у ног игрока / в зоне «подарка» не трогаем
    if (item.name === 'wheat' && (nearOtherPlayer(bot, e.position) || isGiftedDrop(e.position))) {
      markUnreachable(e.id, 10000)
      continue
    }

    const d = bot.entity.position.distanceTo(e.position)
    if (d < RANGE && d < bestDist) {
      bestDist = d
      best = e
    }
  }
  return best
}

async function goPickup(bot, drop, label) {
  if (!drop) return false
  if (isMarkedUnreachable(drop.id)) return false

  const id = drop.id
  let dist = bot.entity.position.distanceTo(drop.position)

  // слишком далеко за один заход — идём, но с таймаутом; иначе ферма встанет
  if (dist > 1.5) {
    const ok = await goNear(bot, drop.position, 1, 6000)
    const still = bot.entities[id]
    if (!still) return true // подобрали / исчез

    dist = bot.entity.position.distanceTo(still.position)
    if (!ok || dist > 2.2) {
      markUnreachable(id, 20000)
      console.log(`[farmer] skip far ${label} (dist=${dist.toFixed(1)})`)
      bot.pathfinder.setGoal(null)
      return false
    }
  }

  // подождать вакуум подбора, проверить что предмет реально пропал
  await sleep(400)
  if (bot.entities[id]) {
    const left = bot.entity.position.distanceTo(bot.entities[id].position)
    if (left > 2) {
      markUnreachable(id, 20000)
      console.log(`[farmer] skip stuck ${label} (dist=${left.toFixed(1)})`)
      return false
    }
    // почти рядом но не поднял — чуть ближе и ещё раз
    await goNear(bot, bot.entities[id].position, 0, 3000)
    await sleep(300)
    if (bot.entities[id]) {
      markUnreachable(id, 10000)
      return false
    }
  }

  console.log(`[farmer] pickup ${label}`)
  return true
}

async function pickupBoneMeal(bot) {
  return goPickup(bot, findDroppedItem(bot, ['bone_meal']), 'bone_meal')
}

async function pickupNearby(bot) {
  return goPickup(bot, findDroppedItem(bot, ['wheat', 'wheat_seeds']), 'crops')
}

function composterLevel(block) {
  if (!block || block.name !== 'composter') return -1
  const lvl = block._properties?.level
  return typeof lvl === 'number' ? lvl : -1
}

function findComposters(bot) {
  const id = bot.registry.blocksByName.composter?.id
  if (id == null) return []
  return bot.findBlocks({
    matching: id,
    maxDistance: RANGE,
    count: 32,
  }).sort((a, b) =>
    bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b)
  )
}

async function collectComposterBoneMeal(bot) {
  for (const pos of findComposters(bot)) {
    const block = bot.blockAt(pos)
    if (composterLevel(block) !== 8) continue

    if (bot.entity.position.distanceTo(pos) > 3.2) {
      await goNear(bot, pos, 2)
    }

    try {
      // пустая рука / любой предмет — клик по полной компостице забирает bone meal
      await bot.activateBlock(block)
      console.log('[farmer] took bone meal from composter', pos)
      await sleep(200)
      return true
    } catch {
      // next
    }
  }
  return false
}

async function compostExtraSeeds(bot) {
  const seedsTotal = countItem(bot, 'wheat_seeds')
  const emptyPlots = emptyFarmlandPositions(bot).length
  const keep = Math.max(SEED_RESERVE, emptyPlots)
  if (seedsTotal <= keep) return false

  const composters = findComposters(bot)
  if (!composters.length) return false

  // сначала недолитые, потом любые < 8
  const targets = composters
    .map((pos) => ({ pos, level: composterLevel(bot.blockAt(pos)) }))
    .filter((c) => c.level >= 0 && c.level < 8)

  if (!targets.length) return false

  let composted = 0
  for (const { pos } of targets) {
    while (countItem(bot, 'wheat_seeds') > keep && composted < 16) {
      const block = bot.blockAt(pos)
      if (!block || composterLevel(block) < 0 || composterLevel(block) >= 8) break

      if (bot.entity.position.distanceTo(pos) > 3.2) {
        await goNear(bot, pos, 2)
      }

      const seeds = bot.inventory.items().find((i) => i.name === 'wheat_seeds')
      if (!seeds) break

      try {
        await bot.equip(seeds, 'hand')
        await bot.activateBlock(block)
        composted++
        await sleep(120)
      } catch {
        break
      }
    }
    if (composted > 0) break
  }

  if (composted > 0) {
    console.log(`[farmer] composted ${composted} seeds`)
    return true
  }
  return false
}

function wheatAge(block) {
  if (!block || block.name !== 'wheat') return -1
  const age = block._properties?.age
  if (typeof age === 'number') return age
  if (typeof block.metadata === 'number') return block.metadata
  return -1
}

function emptyFarmlandPositions(bot) {
  const id = bot.registry.blocksByName.farmland?.id
  if (id == null) return []

  return bot.findBlocks({
    matching: id,
    maxDistance: RANGE,
    count: 128,
  }).filter((pos) => {
    if (!pos) return false
    const above = bot.blockAt(pos.offset(0, 1, 0))
    return above && above.name === 'air'
  }).sort((a, b) =>
    bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b)
  )
}

async function plantAllEmptyFarmland(bot) {
  if (countItem(bot, 'wheat_seeds') < 1) return false

  const soils = emptyFarmlandPositions(bot)
  if (!soils.length) return false

  let planted = 0
  for (const pos of soils) {
    if (countItem(bot, 'wheat_seeds') < 1) break

    const soil = bot.blockAt(pos)
    const above = bot.blockAt(pos.offset(0, 1, 0))
    if (!soil || soil.name !== 'farmland' || !above || above.name !== 'air') continue

    if (bot.entity.position.distanceTo(pos) > 3.2) {
      await goNear(bot, pos, 2)
    }

    const seeds = bot.inventory.items().find((i) => i.name === 'wheat_seeds')
    if (!seeds) break

    try {
      await bot.equip(seeds, 'hand')
      await bot.placeBlock(soil, new Vec3(0, 1, 0))
      planted++
      console.log('[farmer] planted', pos)
    } catch {
      // занято / не достал
    }
    await sleep(80)
  }

  return planted > 0
}

async function harvestMatureWheat(bot) {
  const crop = bot.findBlock({
    matching: (b) => wheatAge(b) === 7,
    maxDistance: RANGE,
  })
  if (!crop) return false

  if (bot.entity.position.distanceTo(crop.position) > 3.2) {
    await goNear(bot, crop.position, 2)
  }

  await bot.dig(crop)
  console.log('[farmer] harvested', crop.position)
  await sleep(150)

  // сразу засеять снова
  if (countItem(bot, 'wheat_seeds') > 0) {
    const soil = bot.blockAt(crop.position.offset(0, -1, 0))
    if (soil && soil.name === 'farmland') {
      try {
        const seeds = bot.inventory.items().find((i) => i.name === 'wheat_seeds')
        await bot.equip(seeds, 'hand')
        await bot.placeBlock(soil, new Vec3(0, 1, 0))
      } catch {
        // ok
      }
    }
  }
  return true
}

async function applyBoneMeal(bot) {
  if (countItem(bot, 'bone_meal') < 1) return false

  const crop = bot.findBlock({
    matching: (b) => {
      const age = wheatAge(b)
      return age >= 0 && age < 7
    },
    maxDistance: RANGE,
  })
  if (!crop) return false

  if (bot.entity.position.distanceTo(crop.position) > 3.2) {
    await goNear(bot, crop.position, 2)
  }

  // жмём костную муку пока не созреет или не кончится
  let uses = 0
  while (uses < 10) {
    if (countItem(bot, 'bone_meal') < 1) break
    const current = bot.blockAt(crop.position)
    if (!current || wheatAge(current) < 0 || wheatAge(current) >= 7) break

    const meal = bot.inventory.items().find((i) => i.name === 'bone_meal')
    if (!meal) break

    try {
      await bot.equip(meal, 'hand')
      await bot.activateBlock(current)
    } catch {
      break
    }
    uses++
    await sleep(120)
  }

  if (uses > 0) {
    console.log(`[farmer] bone meal x${uses} @`, crop.position)
    return true
  }
  return false
}

async function goNear(bot, pos, range, timeoutMs = 8000) {
  if (!pos || pos.x == null) return false
  try {
    const walk = bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, range))
    const timed = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        bot.pathfinder.setGoal(null)
        reject(new Error('path timeout'))
      }, timeoutMs)
      walk.then(
        (v) => { clearTimeout(t); resolve(v) },
        (e) => { clearTimeout(t); reject(e) }
      )
    })
    await timed
    return true
  } catch {
    bot.pathfinder.setGoal(null)
    return false
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

console.log(`[farmer] ${HOST}:${PORT} as ${USERNAME} (auth=${AUTH}, version=${VERSION})`)
createBot()
