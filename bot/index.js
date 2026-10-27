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

function tagIds(forum, state) {
  const wanted = new Set([state, 'à faire']);
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
  const channelId = channelIdFrom(item.discord_url);
  const channel = await client.channels.fetch(channelId);
  const embed = richEmbed(item.embed);
  const payload = embed
    ? { embeds: [embed] }
    : { content: String(item.content || '').slice(0, 1900) };
  const message = await channel.send(payload);
  await api('POST', { kind: 'publication', collection: item.collection, id: item.id, message_id: message.id });
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

async function postMarket(client, item) {
  const channel = await client.channels.fetch(item.channel_id);
  const embed = richEmbed(item.embed);
  const message = await channel.send(embed ? { embeds: [embed] } : { content: `Palier ${item.palier}` });
  await api('POST', { kind: 'market', week: item.week, palier: item.palier, message_id: message.id });
}

async function postInterest(client, item) {
  const channel = await client.channels.fetch(channelIdFrom(item.discord_url));
  const embed = richEmbed(item.embed);
  const message = await channel.send(embed ? { embeds: [embed] } : { content: String(item.content || '').slice(0, 1900) });
  await api('POST', { kind: 'interest', collection: item.collection, id: item.id, message_id: message.id });
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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('clientReady', () => {
  console.log(`Banque Fédérale connectée en tant que ${client.user.tag}`);
  const run = () => tick(client).catch((error) => console.error(error.message));
  run();
  setInterval(run, 60 * 1000);
});

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error('DISCORD_BOT_TOKEN manquant. Le bot Banque Fédérale ne démarre pas.');
  process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);
