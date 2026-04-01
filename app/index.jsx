import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { init, loadSavedToken } from '../src/discord';

export default function LoginScreen() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadSavedToken().then(saved => {
      if (saved) {
        init(saved)
          .then(() => router.replace('/chat'))
          .catch(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  async function handleConnect() {
    const t = token.trim();
    if (!t) return;
    setConnecting(true);
    try {
      await init(t);
      router.replace('/chat');
    } catch(e) {
      Alert.alert('Error', 'Invalid token or connection failed.\n' + e.message);
    } finally {
      setConnecting(false);
    }
  }

  if (loading) return (
    <View style={[s.bg, { justifyContent:'center', alignItems:'center' }]}>
      <ActivityIndicator size="large" color="#5865f2" />
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.bg} behavior={Platform.OS==='ios'?'padding':undefined}>
      <View style={s.card}>
        <Text style={s.emoji}>🤖</Text>
        <Text style={s.title}>BotControl</Text>
        <Text style={s.sub}>Enter your Discord bot token to continue</Text>

        <TextInput
          style={s.input}
          value={token}
          onChangeText={setToken}
          placeholder="Bot token (from Discord Developer Portal)"
          placeholderTextColor="#4e5058"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <TouchableOpacity style={s.btn} onPress={handleConnect} disabled={connecting}>
          {connecting
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>Connect Bot</Text>
          }
        </TouchableOpacity>

        <Text style={s.hint}>
          Get your token from{'\n'}
          discord.com/developers → Your App → Bot → Token
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bg:     { flex:1, backgroundColor:'#1a1b1e', justifyContent:'center', alignItems:'center', padding:24 },
  card:   { width:'100%', maxWidth:360, alignItems:'center', gap:14 },
  emoji:  { fontSize:52, marginBottom:4 },
  title:  { fontSize:26, fontWeight:'800', color:'#fff' },
  sub:    { fontSize:13, color:'#80848e', textAlign:'center' },
  input:  {
    width:'100%', padding:14, backgroundColor:'#2b2d31',
    borderRadius:8, color:'#dbdee1', fontSize:15,
    borderWidth:1.5, borderColor:'#383a40',
  },
  btn:    { width:'100%', padding:14, backgroundColor:'#5865f2', borderRadius:8, alignItems:'center' },
  btnTxt: { color:'#fff', fontWeight:'700', fontSize:15 },
  hint:   { fontSize:12, color:'#4e5058', textAlign:'center', lineHeight:18 },
});
