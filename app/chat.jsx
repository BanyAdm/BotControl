import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, Image, Pressable, Modal, SafeAreaView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  subscribe, getGuilds, getChannels, getMessages,
  sendMessage, getDMs, createDM, searchGuildMembers,
  getMe, logout,
} from '../src/discord';

const C = {
  bg0:'#1a1b1e', bg1:'#232428', bg2:'#2b2d31', bg3:'#313338',
  bg4:'#383a40', accent:'#5865f2', green:'#23a55a', red:'#f23f43',
  text:'#dbdee1', muted:'#80848e', dim:'#4e5058',
};

function Avatar({ url, name, size=38 }) {
  const [err, setErr] = useState(false);
  if (!err && url) return (
    <Image source={{ uri:url }} style={{ width:size, height:size, borderRadius:size/2 }}
      onError={() => setErr(true)} />
  );
  return (
    <View style={{ width:size, height:size, borderRadius:size/2,
      backgroundColor:C.accent, justifyContent:'center', alignItems:'center' }}>
      <Text style={{ color:'#fff', fontWeight:'700', fontSize:size*0.38 }}>
        {(name||'?')[0].toUpperCase()}
      </Text>
    </View>
  );
}

function MessageRow({ msg, prevMsg, myId }) {
  const isFirst = !prevMsg || prevMsg.author_id !== msg.author_id;
  const isMe = msg.author_id === myId;
  return (
    <View style={[styles.msgRow, isFirst && { marginTop:14 }]}>
      <View style={styles.avatarCol}>
        {isFirst
          ? <Avatar url={msg.avatar} name={msg.author} size={36} />
          : <Text style={styles.smallTime}>{msg.timestamp}</Text>
        }
      </View>
      <View style={{ flex:1 }}>
        {isFirst && (
          <View style={styles.msgHeader}>
            <Text style={[styles.author, isMe && { color:C.accent }]}>
              {msg.author}{isMe ? ' 🤖' : ''}
            </Text>
            <Text style={styles.time}>{msg.timestamp}</Text>
          </View>
        )}
        {!!msg.content && <Text style={styles.content}>{msg.content}</Text>}
        {(msg.attachments||[]).map((url,i) => (
          <Image key={i} source={{ uri:url }}
            style={{ maxWidth:260, height:160, borderRadius:6, marginTop:4 }}
            resizeMode="cover" />
        ))}
      </View>
    </View>
  );
}

// DM Search Modal
function DMSearchModal({ visible, onClose, onSelect, guilds }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function search(q) {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const all = [];
      for (const g of guilds.slice(0,3)) {
        const members = await searchGuildMembers(g.id, q);
        members.forEach(m => {
          if (!all.find(x => x.id === m.user.id)) {
            all.push({
              id: m.user.id,
              name: m.nick || m.user.global_name || m.user.username,
              avatar: m.user.avatar
                ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
                : `https://cdn.discordapp.com/embed/avatars/0.png`,
            });
          }
        });
      }
      setResults(all.slice(0,15));
    } catch(e) {}
    setSearching(false);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New DM</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.muted} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search users…"
            placeholderTextColor={C.dim}
            value={query}
            onChangeText={search}
            autoFocus
          />
          {searching && <ActivityIndicator color={C.accent} style={{ marginTop:12 }} />}
          {results.map(u => (
            <TouchableOpacity key={u.id} style={styles.resultRow}
              onPress={() => { onSelect(u); onClose(); setQuery(''); setResults([]); }}>
              <Avatar url={u.avatar} name={u.name} size={34} />
              <Text style={styles.resultName}>{u.name}</Text>
            </TouchableOpacity>
          ))}
          {!searching && query.length >= 2 && results.length === 0 && (
            <Text style={styles.noResults}>No users found</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const [guilds, setGuilds] = useState([]);
  const [dms, setDms] = useState([]);
  const [activeGuild, setActiveGuild] = useState('__dm__');
  const [channels, setChannels] = useState({});
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeChannelName, setActiveChannelName] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dmSearchOpen, setDmSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState(null);
  const listRef = useRef(null);
  const activeChannelRef = useRef(null);
  const refreshRef = useRef(null);
  activeChannelRef.current = activeChannel;

  useEffect(() => {
    const unsub = subscribe(async (data) => {
      if (data.type === 'ready') {
        setConnected(true);
        setMyId(data.user.id);
        loadInitial();
      }
      if (data.type === 'gateway_disconnected') setConnected(false);
      if (data.type === 'gateway_connecting') setConnected(false);
      if (data.type === 'message') {
        if (data.message.channel_id === activeChannelRef.current) {
          setMessages(prev => [...prev.slice(-49), data.message]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated:true }), 80);
        }
      }
    });
    return unsub;
  }, []);

  async function loadInitial() {
    try {
      const [guildList, dmList] = await Promise.all([getGuilds(), getDMs()]);
      setGuilds(guildList || []);
      const dmChannels = (dmList || []).filter(c => c.type === 1).map(c => ({
        id: c.id,
        name: c.recipients?.[0]?.global_name || c.recipients?.[0]?.username || 'Unknown',
        avatar: c.recipients?.[0]?.avatar
          ? `https://cdn.discordapp.com/avatars/${c.recipients[0].id}/${c.recipients[0].avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/0.png`,
        user_id: c.recipients?.[0]?.id,
      }));
      setDms(dmChannels);
    } catch(e) {}
    setLoading(false);
  }

  async function loadChannels(guildId) {
    if (channels[guildId]) return;
    try {
      const list = await getChannels(guildId);
      const text = (list || [])
        .filter(c => c.type === 0)
        .sort((a,b) => a.position - b.position);
      setChannels(prev => ({ ...prev, [guildId]: text }));
    } catch(e) {}
  }

  async function selectChannel(channelId, name) {
    setActiveChannel(channelId);
    setActiveChannelName(name);
    setMessages([]);
    clearInterval(refreshRef.current);
    await fetchHistory(channelId);
    refreshRef.current = setInterval(() => fetchHistory(channelId), 3000);
  }

  async function fetchHistory(channelId) {
    try {
      const msgs = await getMessages(channelId, 15);
      const normalized = (msgs || []).reverse().map(m => ({
        id: m.id,
        channel_id: m.channel_id,
        author: m.author?.global_name || m.author?.username || 'Unknown',
        author_id: m.author?.id,
        avatar: m.author?.avatar
          ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
          : `https://cdn.discordapp.com/embed/avatars/0.png`,
        content: m.content || '',
        timestamp: new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
        attachments: (m.attachments||[]).map(a=>a.url),
      }));
      setMessages(normalized);
    } catch(e) {}
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || !activeChannel) return;
    setInput('');
    try {
      await sendMessage(activeChannel, text);
    } catch(e) {
      Alert.alert('Error', e.message);
    }
  }

  async function openDM(user) {
    try {
      const ch = await createDM(user.id);
      const dmChannel = {
        id: ch.id,
        name: user.name,
        avatar: user.avatar,
        user_id: user.id,
      };
      setDms(prev => prev.find(d=>d.id===ch.id) ? prev : [dmChannel, ...prev]);
      setActiveGuild('__dm__');
      selectChannel(ch.id, '💬 ' + user.name);
      setSidebarOpen(false);
    } catch(e) {
      Alert.alert('Error', e.message);
    }
  }

  function handleLogout() {
    clearInterval(refreshRef.current);
    logout();
    router.replace('/');
  }

  useEffect(() => () => clearInterval(refreshRef.current), []);

  // ── Sidebar content ──
  const SidebarContent = (
    <View style={styles.sidebarWrap}>
      {/* Guild strip */}
      <View style={styles.guildStrip}>
        <TouchableOpacity
          style={[styles.guildIcon, activeGuild==='__dm__' && styles.guildIconActive]}
          onPress={() => setActiveGuild('__dm__')}>
          <Ionicons name="chatbubbles" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.guildSep} />
        {guilds.map(g => (
          <TouchableOpacity key={g.id}
            style={[styles.guildIcon, activeGuild===g.id && styles.guildIconActive]}
            onPress={() => { setActiveGuild(g.id); loadChannels(g.id); }}>
            {g.icon
              ? <Image source={{ uri:`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` }}
                  style={{ width:48, height:48, borderRadius: activeGuild===g.id?16:24 }} />
              : <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>
                  {g.name.slice(0,2).toUpperCase()}
                </Text>
            }
          </TouchableOpacity>
        ))}
        {/* Logout at bottom */}
        <View style={{ flex:1 }} />
        <TouchableOpacity style={[styles.guildIcon, { backgroundColor:C.red+'33' }]}
          onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={C.red} />
        </TouchableOpacity>
      </View>

      {/* Channel panel */}
      <View style={styles.channelPanel}>
        {activeGuild === '__dm__' ? (
          <>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Direct Messages</Text>
              <TouchableOpacity onPress={() => setDmSearchOpen(true)}>
                <Ionicons name="add" size={24} color={C.muted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={dms}
              keyExtractor={d => d.id}
              renderItem={({ item:d }) => (
                <TouchableOpacity
                  style={[styles.channelRow, activeChannel===d.id && styles.channelRowActive]}
                  onPress={() => { selectChannel(d.id, '💬 '+d.name); setSidebarOpen(false); }}>
                  <Avatar url={d.avatar} name={d.name} size={30} />
                  <Text style={[styles.channelName, activeChannel===d.id&&{color:'#fff'}]}
                    numberOfLines={1}>{d.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyTxt}>No DMs yet.{'\n'}Tap + to start one.</Text>
              }
            />
          </>
        ) : (
          <>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle} numberOfLines={1}>
                {guilds.find(g=>g.id===activeGuild)?.name || ''}
              </Text>
            </View>
            <Text style={styles.sectionLabel}>Text Channels</Text>
            <FlatList
              data={channels[activeGuild] || []}
              keyExtractor={c => c.id}
              renderItem={({ item:ch }) => (
                <TouchableOpacity
                  style={[styles.channelRow, activeChannel===ch.id && styles.channelRowActive]}
                  onPress={() => { selectChannel(ch.id, '#'+ch.name); setSidebarOpen(false); }}>
                  <Text style={styles.hash}>#</Text>
                  <Text style={[styles.channelName, activeChannel===ch.id&&{color:'#fff'}]}
                    numberOfLines={1}>{ch.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<ActivityIndicator color={C.accent} style={{marginTop:20}} />}
            />
          </>
        )}
      </View>
    </View>
  );

  if (loading) return (
    <View style={[styles.screen, {justifyContent:'center',alignItems:'center'}]}>
      <ActivityIndicator size="large" color={C.accent} />
      <Text style={{color:C.muted,marginTop:12}}>Loading bot data…</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      {/* Sidebar modal */}
      <Modal visible={sidebarOpen} animationType="slide" transparent
        onRequestClose={() => setSidebarOpen(false)}>
        <Pressable style={styles.drawerOverlay} onPress={() => setSidebarOpen(false)}>
          <Pressable style={styles.drawer} onPress={e=>e.stopPropagation()}>
            {SidebarContent}
          </Pressable>
        </Pressable>
      </Modal>

      <DMSearchModal
        visible={dmSearchOpen}
        onClose={() => setDmSearchOpen(false)}
        onSelect={openDM}
        guilds={guilds}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSidebarOpen(true)} style={{padding:4}}>
          <Ionicons name="menu" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {activeChannelName || 'BotControl'}
        </Text>
        <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
          <View style={{width:8,height:8,borderRadius:4,
            backgroundColor:connected?C.green:C.red}} />
          <Text style={{fontSize:11,color:C.muted}}>{connected?'live':'off'}</Text>
        </View>
      </View>

      {/* Chat */}
      {activeChannel ? (
        <KeyboardAvoidingView style={{flex:1}}
          behavior={Platform.OS==='ios'?'padding':'height'}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m,i) => m.id||String(i)}
            renderItem={({item,index}) => (
              <MessageRow msg={item} prevMsg={index>0?messages[index-1]:null} myId={myId} />
            )}
            style={{flex:1,backgroundColor:C.bg3}}
            contentContainerStyle={{paddingBottom:8}}
            onContentSizeChange={() => listRef.current?.scrollToEnd({animated:false})}
            ListEmptyComponent={
              <View style={{alignItems:'center',marginTop:60}}>
                <Text style={{color:C.muted}}>No messages yet</Text>
              </View>
            }
          />
          <View style={styles.inputBar}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                placeholder={`Message ${activeChannelName}`}
                placeholderTextColor={C.muted}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity onPress={handleSend} style={styles.sendBtn}
                disabled={!input.trim()}>
                <Ionicons name="send" size={20} color={input.trim()?C.accent:C.dim} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={{flex:1,justifyContent:'center',alignItems:'center',backgroundColor:C.bg3}}>
          <Text style={{fontSize:48}}>🤖</Text>
          <Text style={{color:'#fff',fontSize:18,fontWeight:'700',marginTop:12}}>
            Select a channel
          </Text>
          <Text style={{color:C.muted,marginTop:6}}>Tap ☰ to open the sidebar</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex:1, backgroundColor:C.bg0 },
  header:       { flexDirection:'row', alignItems:'center', gap:12, padding:12,
                  backgroundColor:C.bg2, borderBottomWidth:1, borderBottomColor:C.bg0 },
  headerTitle:  { flex:1, color:'#fff', fontWeight:'700', fontSize:16 },
  msgRow:       { flexDirection:'row', gap:12, paddingHorizontal:12, paddingVertical:2 },
  avatarCol:    { width:36, alignItems:'center', paddingTop:2 },
  msgHeader:    { flexDirection:'row', alignItems:'baseline', gap:8, marginBottom:2 },
  author:       { color:'#fff', fontWeight:'700', fontSize:14 },
  time:         { color:C.muted, fontSize:11 },
  smallTime:    { color:C.dim, fontSize:10 },
  content:      { color:C.text, fontSize:14, lineHeight:20 },
  inputBar:     { backgroundColor:C.bg3, padding:8 },
  inputWrap:    { flexDirection:'row', alignItems:'flex-end', backgroundColor:C.bg4, borderRadius:8 },
  textInput:    { flex:1, color:C.text, fontSize:15, maxHeight:100, padding:10 },
  sendBtn:      { padding:10 },
  drawerOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', flexDirection:'row' },
  drawer:        { width:'85%', height:'100%' },
  sidebarWrap:   { flex:1, flexDirection:'row' },
  guildStrip:    { width:68, backgroundColor:C.bg0, alignItems:'center',
                   paddingVertical:8, gap:6 },
  guildIcon:     { width:48, height:48, borderRadius:24, backgroundColor:C.bg2,
                   justifyContent:'center', alignItems:'center', overflow:'hidden' },
  guildIconActive: { borderRadius:16, backgroundColor:C.accent },
  guildSep:      { width:32, height:2, backgroundColor:C.bg3, borderRadius:2, marginVertical:2 },
  channelPanel:  { flex:1, backgroundColor:C.bg2 },
  panelHeader:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                   padding:14, borderBottomWidth:1, borderBottomColor:C.bg0 },
  panelTitle:    { color:'#fff', fontWeight:'700', fontSize:15, flex:1 },
  sectionLabel:  { color:C.muted, fontSize:11, fontWeight:'700', textTransform:'uppercase',
                   letterSpacing:0.5, paddingHorizontal:12, paddingTop:12, paddingBottom:4 },
  channelRow:    { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:10,
                   paddingVertical:7, borderRadius:4, marginHorizontal:4 },
  channelRowActive: { backgroundColor:C.bg4 },
  channelName:   { color:C.muted, fontSize:14, flex:1 },
  hash:          { color:C.dim, fontSize:18, fontWeight:'700' },
  emptyTxt:      { color:C.muted, fontSize:13, textAlign:'center', marginTop:24, lineHeight:20 },
  modalOverlay:  { flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end' },
  modalCard:     { backgroundColor:C.bg2, borderTopLeftRadius:16, borderTopRightRadius:16,
                   padding:16, minHeight:320 },
  modalHeader:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
  modalTitle:    { color:'#fff', fontWeight:'700', fontSize:17 },
  searchInput:   { backgroundColor:C.bg0, borderRadius:8, padding:12, color:C.text, fontSize:15, marginBottom:8 },
  resultRow:     { flexDirection:'row', alignItems:'center', gap:12, padding:10, borderRadius:8 },
  resultName:    { color:'#fff', fontWeight:'600', fontSize:14 },
  noResults:     { color:C.muted, textAlign:'center', marginTop:24 },
});
