# VoiceComm 🎙️

VoiceComm is a **Low-Bandwidth, Peer-to-Peer Voice Communication Web Application** designed to function reliably under challenging and unstable network conditions. It ensures clear, uninterrupted voice chat with extreme optimizations for low-data environments or gaming sessions.

## 🚀 Features

- **Peer-to-Peer Audio:** Direct audio streaming between users using WebRTC for minimal latency.
- **Ultra-Low Bandwidth:** Uses a highly optimized Opus codec tuned for extreme low-bandwidth scenarios (capped at 16 kbps).
- **Strong Resiliency:** Enforces Forward Error Correction (FEC) and Constant Bitrate (CBR) to maintain stream stability on jittery/unstable connections.
- **FastAPI Signaling Server:** A high-performance Python backend to negotiate zero-config connections quickly via WebSockets.
- **React UI:** A clean, responsive, tactical UI for creating/joining rooms and managing microphone states.

---

## 🧠 What is Happening & How It Works

VoiceComm is composed of two main pieces: a **Signaling Server (Backend)** and a **WebRTC Client (Frontend)**. Here is an explanation of the flow:

### 1. The Signaling Phase (FastAPI)
WebRTC enables peers to talk directly to each other peer-to-peer, but first, they must exchange connection information. This is called "signaling".
1. A user enters a room code (e.g., `Room 123`). The React frontend connects to the backend over a WebSocket (`ws://localhost:8000/ws/123/{clientId}`).
2. The FastAPI `ConnectionManager` keeps a registry of all active websockets in this room.
3. When the second user joins, they exchange **SDP Offers and Answers** (Session Description Protocol) and **ICE Candidates** (networking addresses) via the WebSocket server.
4. Once connection details are swapped, the WebSocket's job is mostly done, and the actual audio stream goes directly from Peer A to Peer B.

### 2. The Audio Optimization Phase (React/WebRTC)
Standard WebRTC is designed for high-quality audio and video and uses a variable bitrate. VoiceComm intentionally cripples WebRTC's bandwidth usage to make it indestructible on bad networks.

**How we achieve Low-Bandwidth (SDP Munging):**
In `App.jsx`, there is a function called `optimizeOpusSDP()`. Before the frontend sends its connection offer/answer over the WebSocket, it intercepts the SDP string and forcefully injects specific rules for the Opus audio codec on the `a=fmtp:` line:

- `maxaveragebitrate=16000`: Capping the bitrate to a maximum of 16 kbps.
- `cbr=1`: Forces **Constant Bitrate**. Voice apps often spike bandwidth when people speak loudly; this forces it to stay completely flat and predictable.
- `fec=1` & `useinbandfec=1`: Enables **Forward Error Correction**. It sends redundant data so that if network packets are dropped, the audio can be reconstructed without skipping or robot-voices.
- `stereo=0`: Compels the stream to be mono audio, saving substantial bandwidth.

Once WebRTC connects using these aggressive constraints, you have an extremely robust, ultra-low bandwidth comms link.

---

## 🛠️ Setup & Installation

### 1. Setup the Backend
The backend runs on Python and FastAPI.
```bash
cd backend
python -m venv venv

# Activate venv on Windows:
venv\Scripts\activate
# Activate venv on Mac/Linux:
# source venv/bin/activate

pip install -r requirements.txt
# (Make sure fastapi, uvicorn, and websockets are installed)

# Run the signaling server
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Setup the Frontend
The frontend is a React application powered by Vite.
```bash
cd frontend
npm install

# Run the development server
npm run dev
```
Open `http://localhost:5173` in your browser. Allow microphone access to start testing.

### 🚢 Production Build (All-In-One Serving)
If you build the frontend, the FastAPI backend will serve it directly!
1. `cd frontend`
2. `npm run build`
3. Restart the FastAPI server. It detects the `dist` folder and serves your React web app at `http://localhost:8000/`.
