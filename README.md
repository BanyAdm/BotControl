# BotControl — Discord Bot Android App

Discord-style Android app to control your bot from your phone.
Built with Expo + React Native. APK built for free in the cloud via EAS.

---

## 📱 Setup (Termux on Android or any PC)

### 1. Install tools in Termux
```bash
pkg update && pkg upgrade
pkg install nodejs git
npm install -g eas-cli expo-cli
```

### 2. Clone your repo
```bash
git clone https://github.com/YOUR_USERNAME/BotControl.git
cd BotControl
npm install
```

### 3. Login to Expo
```bash
eas login
# or: npx expo login
```

### 4. Build APK (FREE, cloud build — no Android Studio needed)
```bash
eas build --platform android --profile preview
```
- This uploads your code to Expo's servers
- They compile it and give you a download link for the APK
- Takes ~5-10 minutes

### 5. Install APK on your phone
Download from the link EAS gives you, open it on your Android.

---

## 🖥️ Running the Bot Server (on your PC)

```bash
pip install discord.py python-dotenv websockets
python server.py
```

Make sure `.env` has:
```
BOT_TOKEN=your_token_here
WS_PORT=8765
```

Your phone and PC must be on the **same WiFi network**.
Enter `ws://YOUR_PC_LOCAL_IP:8765` in the app.
(Find your PC IP: run `ipconfig` on Windows, look for IPv4)

---

## Features
- Browse all servers & channels
- Live DM conversations (auto-refreshes every 3s)
- Search users & start new DMs
- Send messages from any channel
- Discord-style UI (dark theme)
