from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Dict, List
import json
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("signaling")

app = FastAPI()

# Add CORS middleware to allow the frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        # Maps room_id -> list of active WebSockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, client_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        logger.info(f"Client {client_id} connected to room {room_id}")

    def disconnect(self, websocket: WebSocket, room_id: str, client_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)
                logger.info(f"Client {client_id} disconnected from room {room_id}")
            if len(self.active_connections[room_id]) == 0:
                del self.active_connections[room_id]

    async def broadcast_to_room(self, message: str, room_id: str, sender: WebSocket):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                if connection != sender:
                    await connection.send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    await manager.connect(websocket, room_id, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Broadcast the WebRTC signaling data
            await manager.broadcast_to_room(data, room_id, websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id, client_id)
        # Notify other peers in the room about the disconnection
        disconnect_msg = json.dumps({"type": "peer-disconnected", "client_id": client_id})
        await manager.broadcast_to_room(disconnect_msg, room_id, websocket)


# ==========================================
# 🚀 PWA AND STATIC FILE SERVING FIX
# ==========================================

# Using abspath to ensure Render finds the exact directory regardless of where it starts
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
frontend_dist = os.path.join(BASE_DIR, "frontend", "dist")

if os.path.exists(frontend_dist):
    # Serve CSS/JS chunks
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    # Catch-all route for PWA icons, manifest.json, sw.js, and index.html
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Agar user directly root URL (/) par aata hai, toh index.html de do
        if full_path == "":
            return FileResponse(os.path.join(frontend_dist, "index.html"))
            
        file_path = os.path.join(frontend_dist, full_path)
        
        # Agar browser ne specific file maangi hai (jaise pwa-192x192.png) aur wo exist karti hai
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Agar koi random URL/route daal diya (e.g. /room/123), toh react router handle karega, index.html bhej do
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
            
        return {"error": "Frontend build partially missing. Run 'npm run build'."}
else:
    @app.get("/")
    def read_root():
        return {"status": "Signaling server running. (Frontend not built. Run 'npm run build' in frontend folder, then restart server)"}