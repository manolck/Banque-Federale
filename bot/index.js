const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

function loadEnv() {
  const fs = require('fs');
  const path = require('path');
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();

const apiBase = process.env.BANK_API_URL || 'http://127.0.0.1:3000';
const key = process.env.DISCORD_AGENDA_API_KEY || '';
const forumId = process.env.DISCORD_MISSION_FORUM_ID || '';
const fundsForumId = process.env.DISCORD_FUNDS_FORUM_ID || '';
const FUNDS_FORUM_NAME = '💰・fonds-spéculatifs';
const SCAN_CHUNK = 25;

/** Horaires Europe/Paris : daily 16h, tirage fonds 18h, édition Discord + comptes 19h.
 *  Les actions au clic (souscriptions / avis) restent en poll fréquent. */
const SLOT_DAILY = { hour: 16, minute: 0, key: 'daily' };
const SLOT_MARKET = { hour: 18, minute: 0, key: 'market' };
const SLOT_SCAN = { hour: 19, minute: 0, key: 'scan' };
const CLOCK_EVERY_MS = 30 * 1000;
const REALTIME_EVERY_MS = 60 * 1000;

let scanning = false;
const ran = { daily: '', market: '', scan: '' };
const jobBusy = { realtime: false, daily: false, market: false, scan: false };
const inFlight = new Set();

async function withJobLock(name, fn) {
  if (jobBusy[name]) {
    console.log(`Skip ${name} — déjà en cours`);
    return undefined;
  }
  jobBusy[name] = true;
  try {
    return await fn();
  } finally {
    jobBusy[name] = false;
  }
}

function flightKey(kind, item) {
  if (kind === 'publication') return `publication:${item.collection}:${item.id}`;
  if (kind === 'notice') return `notice:${item.collection}:${item.id}:${item.notice_id}`;
  if (kind === 'mission') return `mission:${item.collection}:${item.id}:${item.key}`;
  if (kind === 'interest') return `interest:${item.collection}:${item.id}:${item.key}`;
  if (kind === 'market') return `market:${item.week}:${item.palier}`;
  return `${kind}:${JSON.stringify(item && item.id)}`;
}

async function once(kind, item, fn) {
  const key = flightKey(kind, item);
  if (inFlight.has(key)) {
    console.log(`Skip doublon ${key}`);
    return;
  }
  inFlight.add(key);
  try {
    await fn();
  } finally {
    inFlight.delete(key);
  }
}

function channelIdFrom(url) {
  const match = String(url || '').match(/channels\/\d+\/(\d+)/);
  return match ? match[1] : '';
}

function parisParts(date = new Date()) {
  const bag = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    date: `${bag.year}-${bag.month}-${bag.day}`,
    hour,
    minute: Number(bag.minute)
  };
}

function slotDue(parts, slot) {
  const nowMins = parts.hour * 60 + parts.minute;
  const target = slot.hour * 60 + slot.minute;
  return nowMins >= target && ran[slot.key] !== parts.date;
}

function markSlot(parts, slot) {
  ran[slot.key] = parts.date;
}

function nextSlotLabel(slot) {
  const parts = parisParts();
  const nowMins = parts.hour * 60 + parts.minute;
  const target = slot.hour * 60 + slot.minute;
  const when = nowMins < target ? 'aujourd’hui' : 'demain';
  return `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')} (${when})`;
}

async function api(method, body, query = '') {
  const response = await fetch(`${apiBase}/api/discord_outbox${query}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Registre ${response.status}`);
  return data;
}

function tagIds(forum, names) {
  const wanted = new Set((Array.isArray(names) ? names : [names, 'à faire']).map((name) => String(name || '').toLocaleLowerCase('fr')));
  return (forum.availableTags || [])
    .filter((tag) => wanted.has(String(tag.name || '').toLocaleLowerCase('fr')))
    .map((tag) => tag.id);
}

async function rolePing(guild, state) {
  const name = state === 'texas' ? 'Texas' : 'Louisiane';
  const role = guild && guild.roles.cache.find((item) => item.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
  return role ? `<@&${role.id}>` : `@${name}`;
}

async function rolePingNamed(guild, name) {
  const wanted = String(name || '').toLocaleLowerCase('fr');
  const role = guild && guild.roles.cache.find((item) => String(item.name || '').toLocaleLowerCase('fr') === wanted);
  return role ? `<@&${role.id}>` : `@${name}`;
}

function richEmbed(embed) {
  if (!embed || typeof embed !== 'object') return null;
  const title = embed.title ? String(embed.title).slice(0, 256) : '';
  const description = embed.description ? String(embed.description).slice(0, 4096) : '';
  if (!title && !description) return null;
  const out = {
    author: { name: String((embed.author && embed.author.name) || 'Interstate Banking & Trust Company').slice(0, 256) },
    color: Number.isInteger(embed.color) ? embed.color : 0xd7a64d
  };
  if (title) out.title = title;
  if (description) out.description = description;
  if (embed.footer && embed.footer.text) out.footer = { text: String(embed.footer.text).slice(0, 2048) };
  return out;
}

async function postSummary(client, item) {
  if (!item.forum_id) throw new Error('Forum du reçu manquant.');
  const forum = await client.channels.fetch(item.forum_id);
  if (forum.type !== ChannelType.GuildForum) throw new Error('Le reçu d’ouverture doit viser un forum.');
  const embed = richEmbed(item.embed);
  if (!embed) throw new Error('Reçu sans contenu.');
  const thread = await forum.threads.create({
    name: String(item.title || 'Dossier').slice(0, 100),
    message: { embeds: [embed] },
    appliedTags: tagIds(forum, item.tags || []).slice(0, 5)
  });
  const discord_url = `https://discord.com/channels/${forum.guildId}/${thread.id}`;
  await api('POST', { kind: 'publication', collection: item.collection, id: item.id, message_id: thread.id, discord_url });
}

async function postMission(client, item) {
  if (!forumId) throw new Error('DISCORD_MISSION_FORUM_ID manquant.');
  const forum = await client.channels.fetch(forumId);
  if (forum.type !== ChannelType.GuildForum) throw new Error('Le salon des ordres de mission doit être un forum.');
  const guild = forum.guild;
  const ping = await rolePing(guild, item.state);
  const mention = `@${item.state === 'texas' ? 'Texas' : 'Louisiane'}`;
  const content = String(item.content || mention).split(mention).join(ping).slice(0, 1900);
  const embed = richEmbed(item.embed);
  const thread = await forum.threads.create({
    name: item.title,
    message: embed ? { content, embeds: [embed] } : { content },
    appliedTags: tagIds(forum, item.state).slice(0, 5)
  });
  await api('POST', { kind: 'mission', collection: item.collection, id: item.id, key: item.key, message_id: thread.id });
}

async function postNotice(client, item) {
  const channel = await client.channels.fetch(channelIdFrom(item.discord_url));
  const embed = richEmbed(item.embed);
  let content = String(item.content || '').trim();
  if (content.includes('@')) {
    const guild = channel.guild || (channel.guildId ? await client.guilds.fetch(channel.guildId) : null);
    if (guild && !guild.roles.cache.size) await guild.roles.fetch();
    for (const name of ['Réserve fédérale', 'Texas', 'Louisiane', 'Directeur']) {
      if (!content.includes(`@${name}`)) continue;
      const ping = await rolePingNamed(guild, name);
      content = content.split(`@${name}`).join(ping);
    }
  }
  content = content.slice(0, 1900);
  const message = await channel.send(
    embed
      ? (content ? { content, embeds: [embed] } : { embeds: [embed] })
      : { content: content || '—' }
  );
  await api('POST', { kind: 'notice', collection: item.collection, id: item.id, notice_id: item.notice_id, message_id: message.id });
}

function marketCard(embed) {
  if (!embed || typeof embed !== 'object') return null;
  const title = embed.title ? String(embed.title).slice(0, 256) : '';
  const description = embed.description ? String(embed.description).slice(0, 4096) : '';
  if (!title && !description) return null;
  const out = { color: Number.isInteger(embed.color) ? embed.color : 0x9370db };
  if (title) out.title = title;
  if (description) out.description = description;
  if (Array.isArray(embed.fields) && embed.fields.length) {
    out.fields = embed.fields.slice(0, 25).map((field) => ({
      name: String((field && field.name) || '—').slice(0, 256),
      value: String((field && field.value) || '—').slice(0, 1024),
      inline: Boolean(field && field.inline)
    }));
  }
  if (embed.footer && embed.footer.text) out.footer = { text: String(embed.footer.text).slice(0, 2048) };
  return out;
}

async function resolveMarketMessage(client, channel, editId) {
  try {
    return await channel.messages.fetch(editId);
  } catch (_) { /* continue */ }
  const asThread = await client.channels.fetch(editId).catch(() => null);
  if (asThread && asThread.isThread()) {
    const starter = await asThread.fetchStarterMessage();
    if (starter) return starter;
  }
  if (channel.threads) {
    const active = await channel.threads.fetchActive().catch(() => null);
    const threads = active && active.threads && typeof active.threads.values === 'function'
      ? [...active.threads.values()]
      : [];
    for (const thread of threads) {
      try {
        const starter = await thread.fetchStarterMessage();
        if (starter && starter.id === editId) return starter;
      } catch (_) { /* continue */ }
      try {
        return await thread.messages.fetch(editId);
      } catch (_) { /* continue */ }
    }
  }
  return null;
}

async function postMarket(client, item) {
  const channel = await client.channels.fetch(item.channel_id);
  const embed = marketCard(item.embed);
  const payload = embed ? { embeds: [embed] } : { content: 'Haussmann Capital Partners' };
  let message;
  let ackId;
  const editId = String(item.edit_message_id || '').trim();
  if (editId) {
    message = await resolveMarketMessage(client, channel, editId);
    if (!message) throw new Error(`Message marché ${editId} introuvable pour édition.`);
    await message.edit(payload);
    ackId = editId;
  } else if (channel.type === ChannelType.GuildForum) {
    const label = String(item.week || '').slice(0, 10);
    const thread = await channel.threads.create({
      name: `Haussmann Capital Partners · ${label}`.slice(0, 100),
      message: payload
    });
    message = await thread.fetchStarterMessage();
    if (!message) throw new Error('Fil forum créé sans message initial.');
    // On mémorise l’id du fil pour pouvoir l’éditer à 19 h.
    ackId = thread.id;
  } else {
    message = await channel.send(payload);
    ackId = message.id;
  }
  await api('POST', {
    kind: 'market',
    week: item.week,
    palier: item.palier || item.phase || 'releve',
    message_id: ackId || message.id
  });
}

async function postInterest(client, item) {
  const channel = await client.channels.fetch(channelIdFrom(item.discord_url));
  const embed = richEmbed(item.embed);
  const message = await channel.send(embed ? { embeds: [embed] } : { content: String(item.content || '').slice(0, 1900) });
  await api('POST', {
    kind: 'interest',
    collection: item.collection,
    id: item.id,
    key: item.key,
    on: item.on,
    message_id: message.id
  });
}

async function syncApi(method, body) {
  const response = await fetch(`${apiBase}/api/fonds_forum_sync`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Registre ${response.status}`);
  return data;
}

async function findFundsForum(client) {
  if (fundsForumId) return client.channels.fetch(fundsForumId);
  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
  const channels = await guild.channels.fetch();
  return channels.find((channel) => channel && channel.type === ChannelType.GuildForum && channel.name === FUNDS_FORUM_NAME) || null;
}

async function allThreads(forum) {
  const found = new Map();
  const active = await forum.threads.fetchActive();
  active.threads.forEach((thread) => found.set(thread.id, thread));
  let before;
  for (let page = 0; page < 20; page += 1) {
    const archived = await forum.threads.fetchArchived({ limit: 100, before });
    archived.threads.forEach((thread) => found.set(thread.id, thread));
    if (!archived.hasMore || !archived.threads.size) break;
    before = archived.threads.last();
  }
  return [...found.values()];
}

async function readThread(forum, thread) {
  const tagNames = new Map((forum.availableTags || []).map((tag) => [tag.id, tag.name]));
  const messages = [];
  let before;
  for (let page = 0; page < 10; page += 1) {
    const batch = await thread.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    batch.forEach((message) => {
      const embeds = message.embeds.map((embed) => {
        const raw = embed.toJSON();
        return {
          title: raw.title || '',
          description: raw.description || '',
          fields: raw.fields || [],
          footer: raw.footer || null,
          timestamp: raw.timestamp || null,
          author: raw.author ? { name: raw.author.name || '' } : null
        };
      });
      if (embeds.length) messages.push({ id: message.id, embeds });
    });
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return {
    id: thread.id,
    name: thread.name,
    url: `https://discord.com/channels/${thread.guildId}/${thread.id}`,
    tags: (thread.appliedTags || []).map((id) => tagNames.get(id)).filter(Boolean),
    messages
  };
}

async function scanFunds(client) {
  if (scanning) return;
  scanning = true;
  try {
    const forum = await findFundsForum(client);
    if (!forum || forum.type !== ChannelType.GuildForum) throw new Error(`Forum « ${FUNDS_FORUM_NAME} » introuvable.`);
    const threads = await allThreads(forum);
    let created = 0;
    for (let index = 0; index < threads.length || index === 0; index += SCAN_CHUNK) {
      const chunk = [];
      for (const thread of threads.slice(index, index + SCAN_CHUNK)) {
        try { chunk.push(await readThread(forum, thread)); } catch (error) { console.error('Lecture du fil', thread.id, error.message); }
      }
      const last = index + SCAN_CHUNK >= threads.length;
      const result = await syncApi('POST', { threads: chunk, last });
      created += result.created || 0;
    }
    console.log(`Forum des fonds relu : ${threads.length} fil(s), ${created} nouvel(s) écart(s).`);
  } finally {
    scanning = false;
  }
}

async function deliverQueue(client, queue, { publications = false, notices = false, missions = false, interest = false, markets = false } = {}) {
  if (publications) {
    for (const item of queue.publications || []) {
      try {
        await once('publication', item, () => postSummary(client, item));
      } catch (error) { console.error('Publication', item.id, error.message); }
    }
  }
  if (missions) {
    for (const item of queue.missions || []) {
      try {
        await once('mission', item, () => postMission(client, item));
      } catch (error) { console.error('Mission', item.id, error.message); }
    }
  }
  if (interest) {
    for (const item of queue.interest || []) {
      try {
        await once('interest', item, () => postInterest(client, item));
      } catch (error) { console.error('Intérêts', item.id, error.message); }
    }
  }
  if (notices) {
    for (const item of queue.notices || []) {
      try {
        await once('notice', item, () => postNotice(client, item));
      } catch (error) { console.error('Avis', item.id, error.message); }
    }
  }
  if (markets) {
    for (const item of queue.markets || []) {
      try {
        await once('market', item, () => postMarket(client, item));
      } catch (error) { console.error('Séance', item.palier, error.message); }
    }
  }
}

async function runRealtime(client) {
  await withJobLock('realtime', async () => {
    const queue = await api('GET', undefined, '?job=realtime');
    await deliverQueue(client, queue, { publications: true, notices: true });
  });
}

async function runDaily(client) {
  await withJobLock('daily', async () => {
    console.log(`[${parisParts().date} 16:00 Paris] Job daily — missions, intérêts, automatisations`);
    const queue = await api('GET', undefined, '?job=daily');
    await deliverQueue(client, queue, { missions: true, interest: true, notices: true });
    console.log(
      `Daily OK — ${ (queue.missions || []).length } mission(s), ${ (queue.interest || []).length } intérêt(s), ${ (queue.notices || []).length } avis auto`
    );
  });
}

async function flushMarkets(client, label = 'Market') {
  const queue = await api('GET', undefined, '?job=market');
  const meta = queue.markets_meta || {};
  if (meta.channel === false) {
    console.error(`${label} — ni DISCORD_FUNDS_CHANNEL_ID ni DISCORD_FUNDS_FORUM_ID côté API`);
  }
  if (Array.isArray(meta.pending) && meta.pending.length) {
    console.log(`${label} — en attente : ${meta.pending.map((item) => `${item.week}/${item.phase}:${item.reason}`).join(', ')}`);
  }
  await deliverQueue(client, queue, { markets: true, notices: true });
  const pending = (queue.markets || []).length;
  const dossierNotices = (queue.notices || []).length;
  console.log(`${label} — ${pending} relevé(s) global(aux), ${dossierNotices} avis dossier(s)`);
  return pending;
}

async function runMarket(client) {
  await withJobLock('market', async () => {
    console.log(`[${parisParts().date} 18:00 Paris] Job market — tirage + message d’attente`);
    await flushMarkets(client, 'Market draft');
  });
}

async function runScan(client) {
  await withJobLock('scan', async () => {
    console.log(`[${parisParts().date} 19:00 Paris] Édition Discord fonds + actualisation forum`);
    // 19 h : application comptes + édition du message de résultats (1 h après le tirage).
    try {
      await flushMarkets(client, 'Market publish');
    } catch (error) {
      console.error('Market publish', error.message || error);
    }
    await scanFunds(client);
  });
}

function armSchedule(client) {
  console.log('Planning Europe/Paris :');
  console.log('  · poll ~1 min — souscriptions + avis au clic');
  console.log(`  · 16:00 daily (prochain créneau ${nextSlotLabel(SLOT_DAILY)})`);
  console.log(`  · 18:00 tirage fonds + message d’attente (prochain créneau ${nextSlotLabel(SLOT_MARKET)})`);
  console.log(`  · 19:00 édition Discord résultats + scan forum (prochain créneau ${nextSlotLabel(SLOT_SCAN)})`);

  const pulse = () => {
    const parts = parisParts();
    if (slotDue(parts, SLOT_DAILY)) {
      markSlot(parts, SLOT_DAILY);
      runDaily(client).catch((error) => console.error('Daily', error.message || error));
    }
    if (slotDue(parts, SLOT_MARKET)) {
      markSlot(parts, SLOT_MARKET);
      runMarket(client).catch((error) => console.error('Market', error.message || error));
    }
    // Relances : brouillon 18–19 h, édition résultats 19–20 h.
    if (parts.hour >= 18 && parts.hour < 20 && parts.minute % 5 === 0) {
      const retryKey = `market_retry_${parts.date}_${parts.hour}_${parts.minute}`;
      if (ran.market_retry !== retryKey) {
        ran.market_retry = retryKey;
        withJobLock('market', async () => {
          await flushMarkets(client, parts.hour >= 19 ? 'Market publish retry' : 'Market draft retry');
        }).catch((error) => console.error('Market retry', error.message || error));
      }
    }
    if (slotDue(parts, SLOT_SCAN)) {
      markSlot(parts, SLOT_SCAN);
      runScan(client).catch((error) => console.error('Scan fonds', error.message || error));
    }
  };

  const realtime = () => runRealtime(client).catch((error) => console.error('Realtime', error.message || error));

  realtime();
  pulse();
  setInterval(realtime, REALTIME_EVERY_MS);
  setInterval(pulse, CLOCK_EVERY_MS);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.once('clientReady', () => {
  console.log(`Banque Fédérale connectée en tant que ${client.user.tag}`);
  console.log(`API registre : ${apiBase}`);
  armSchedule(client);
  // Au démarrage : tenter tout de suite le flush des séances (brouillon 18 h / résultats 19 h).
  withJobLock('market', async () => {
    await flushMarkets(client, 'Market startup');
  }).catch((error) => console.error('Market startup', error.message || error));
});

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN manquant. Le bot Banque Fédérale ne démarre pas.');
  process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);
