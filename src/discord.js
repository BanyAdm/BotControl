// Discord Gateway + REST — runs entirely on the phone
import AsyncStorage from '@react-native-async-storage/async-storage';

const REST = 'https://discord.com/api/v10';
let _token = null;
let _ws = null;
let _heartbeatInterval = null;
let _sequence = null;
let _sessionId = null;
let _resumeUrl = null;
let _listeners = new Set();
let _reconnectTimeout = null;

export function notifyListeners(data) {
  _listeners.forEach(fn => fn(data));
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export async function init(token) {
  _token = token;
  await AsyncStorage.setItem('bot_token', token);
  await connectGateway();
}

export async function loadSavedToken() {
  const t = await AsyncStorage.getItem('bot_token');
  if (t) { _token = t; return t; }
  return null;
}

export function logout() {
  _token = null;
  AsyncStorage.removeItem('bot_token');
  if (_ws) _ws.close();
  clearInterval(_heartbeatInterval);
  clearTimeout(_reconnectTimeout);
}

// ── REST helpers ──────────────────────────────────────────────────────────────
export async function rest(method, path, body) {
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: {
      'Authorization': `Bot ${_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Discord API error');
  return data;
}

export const getGuilds = () => rest('GET', '/users/@me/guilds');
export const getGuild = (id) => rest('GET', `/guilds/${id}`);
export const getChannels = (guildId) => rest('GET', `/guilds/${guildId}/channels`);
export const getMessages = (channelId, limit=15) =>
  rest('GET', `/channels/${channelId}/messages?limit=${limit}`);
export const sendMessage = (channelId, content) =>
  rest('POST', `/channels/${channelId}/messages`, { content });
export const getUser = (userId) => rest('GET', `/users/${userId}`);
export const getDMs = () => rest('GET', '/users/@me/channels');
export const createDM = (userId) =>
  rest('POST', '/users/@me/channels', { recipient_id: userId });
export const searchGuildMembers = (guildId, query) =>
  rest('GET', `/guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=10`);
export const getMe = () => rest('GET', '/users/@me');

// ── Gateway ───────────────────────────────────────────────────────────────────
async function getGateway() {
  const res = await fetch(`${REST}/gateway/bot`, {
    headers: { 'Authorization': `Bot ${_token}` }
  });
  return res.json();
}

export async function connectGateway() {
  try {
    const gw = await getGateway();
    _resumeUrl = gw.url;
    openSocket(gw.url + '?v=10&encoding=json');
  } catch(e) {
    notifyListeners({ type:'error', message: e.message });
  }
}

function openSocket(url) {
  if (_ws) { try { _ws.close(); } catch {} }
  _ws = new WebSocket(url);

  _ws.onopen = () => {
    notifyListeners({ type:'gateway_connecting' });
  };

  _ws.onmessage = (e) => {
    const payload = JSON.parse(e.data);
    handleGateway(payload);
  };

  _ws.onclose = (e) => {
    clearInterval(_heartbeatInterval);
    notifyListeners({ type:'gateway_disconnected' });
    // Auto reconnect after 5s
    _reconnectTimeout = setTimeout(() => {
      if (_token) connectGateway();
    }, 5000);
  };

  _ws.onerror = () => {
    notifyListeners({ type:'gateway_disconnected' });
  };
}

function handleGateway(payload) {
  const { op, d, s, t } = payload;
  if (s) _sequence = s;

  switch(op) {
    case 10: // Hello — start heartbeat
      startHeartbeat(d.heartbeat_interval);
      if (_sessionId) resume();
      else identify();
      break;

    case 11: // Heartbeat ACK
      break;

    case 1: // Heartbeat request
      sendGateway(1, _sequence);
      break;

    case 9: // Invalid session
      _sessionId = null;
      setTimeout(identify, 2000);
      break;

    case 7: // Reconnect
      _ws.close();
      break;

    case 0: // Dispatch
      handleDispatch(t, d);
      break;
  }
}

function handleDispatch(event, data) {
  switch(event) {
    case 'READY':
      _sessionId = data.session_id;
      _resumeUrl = data.resume_gateway_url;
      notifyListeners({ type:'ready', user: data.user });
      break;

    case 'MESSAGE_CREATE':
      notifyListeners({ type:'message', message: normalizeMessage(data) });
      break;

    case 'MESSAGE_UPDATE':
      notifyListeners({ type:'message_update', message: normalizeMessage(data) });
      break;

    case 'GUILD_CREATE':
      notifyListeners({ type:'guild', guild: data });
      break;
  }
}

function normalizeMessage(m) {
  return {
    id: m.id,
    channel_id: m.channel_id,
    guild_id: m.guild_id,
    author: m.author?.username || 'Unknown',
    author_id: m.author?.id,
    avatar: m.author?.avatar
      ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`,
    content: m.content || '',
    timestamp: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '',
    attachments: (m.attachments || []).map(a => a.url),
    is_me: false, // set in UI
  };
}

function identify() {
  sendGateway(2, {
    token: _token,
    intents: 3276799,
    properties: { os: 'android', browser: 'botcontrol', device: 'botcontrol' },
  });
}

function resume() {
  sendGateway(6, {
    token: _token,
    session_id: _sessionId,
    seq: _sequence,
  });
}

function startHeartbeat(interval) {
  clearInterval(_heartbeatInterval);
  _heartbeatInterval = setInterval(() => {
    sendGateway(1, _sequence);
  }, interval);
}

function sendGateway(op, d) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ op, d }));
  }
}
