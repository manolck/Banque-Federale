const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

const embeds = message.embeds.map((embed) => {
  const raw = embed.toJSON();
  return {
    title: raw.title || '',
    description: raw.description || '',
    fields: raw.fields || [],
    footer: raw.footer || null,
    timestamp: raw.timestamp || null
  };
});

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
const SCAN_EVERY_MS = 15 * 60 * 1000;
const SCAN_CHUNK = 25;
let lastScanAt = 0;
let scanning = false;

function channelIdFrom(url) {
  const match = String(url || '').match(/channels\/\d+\/(\d+)/);
  return match ? match[1] : '';
}

async function api(method, body) {
  const response = await fetch(`${apiBase}/api/discord_outbox`, {
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
  const message = await channel.send(embed ? { embeds: [embed] } : { content: String(item.content || '').slice(0, 1900) });
  await api('POST', { kind: 'notice', collection: item.collection, id: item.id, notice_id: item.notice_id, message_id: message.id });
}

function marketCard(embed) {
  if (!embed || typeof embed !== 'object') return null;
  const title = embed.title ? String(embed.title).slice(0, 256) : '';
  const description = embed.description ? String(embed.description).slice(0, 4096) : '';
  if (!title && !description) return null;
  const out = { color: Number.isInteger(embed.color) ? embed.color : 0x1f8b4c };
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

async function postMarket(client, item) {
  const channel = await client.channels.fetch(item.channel_id);
  const embed = marketCard(item.embed);
  const message = await channel.send(embed ? { embeds: [embed] } : { content: 'Haussmann Capital Partners' });
  await api('POST', { kind: 'market', week: item.week, palier: item.palier, message_id: message.id });
}

async function postInterest(client, item) {
  const channel = await client.channels.fetch(channelIdFrom(item.discord_url));
  const embed = richEmbed(item.embed);
  const message = await channel.send(embed ? { embeds: [embed] } : { content: String(item.content || '').slice(0, 1900) });
  await api('POST', { kind: 'interest', collection: item.collection, id: item.id, message_id: message.id });
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

// Ne garde des messages que ce que le registre sait lire : les embeds.
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
          timestamp: raw.timestamp || null
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
    lastScanAt = Date.now();
    scanning = false;
  }
}

async function maybeScan(client) {
  const state = await syncApi('GET');
  if (state.requested || Date.now() - lastScanAt >= SCAN_EVERY_MS) await scanFunds(client);
}

async function tick(client) {
  const queue = await api('GET');
  for (const item of queue.publications || []) {
    try { await postSummary(client, item); } catch (error) { console.error('Publication', item.id, error.message); }
  }
  for (const item of queue.missions || []) {
    try { await postMission(client, item); } catch (error) { console.error('Mission', item.id, error.message); }
  }
  for (const item of queue.interest || []) {
    try { await postInterest(client, item); } catch (error) { console.error('Intérêts', item.id, error.message); }
  }
  for (const item of queue.markets || []) {
    try { await postMarket(client, item); } catch (error) { console.error('Séance', item.palier, error.message); }
  }
  for (const item of queue.notices || []) {
    try { await postNotice(client, item); } catch (error) { console.error('Avis', item.id, error.message); }
  }
}

// MessageContent est une intention privilégiée : à activer dans le portail développeur Discord (Bot).
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.once('clientReady', () => {
  console.log(`Banque Fédérale connectée en tant que ${client.user.tag}`);
  const run = () => tick(client).catch((error) => console.error(error.message));
  const forum = () => maybeScan(client).catch((error) => console.error('Forum des fonds', error.message));
  run();
  forum();
  setInterval(run, 60 * 1000);
  setInterval(forum, 60 * 1000);
});

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN manquant. Le bot Banque Fédérale ne démarre pas.');
  process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);