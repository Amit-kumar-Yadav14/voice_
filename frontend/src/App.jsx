import React, { useState, useEffect, useRef } from 'react';
import RoomManager from './components/RoomManager';
import AudioController from './components/AudioController';
import './App.css';

// 🌐 ICE servers for WebRTC (Real Internet ke liye STUN/TURN)
const configuration = {
  iceServers: [
    // Free STUN Servers (Google) - Tumhara Public IP pata lagane ke liye
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    
    // 🚨 TURN Server Example (Strict Firewalls ko bypass karne ke liye)
    // Internet par 100% success rate ke liye tumhe TURN server chahiye hoga. 
    // Tum metered.ca par free account banakar apni details yahan daal sakte ho:
    /*
    {
      urls: 'turn:global.relay.metered.ca:80', // Ya 443
      username: 'TUMHARA_METERED_USERNAME',
      credential: 'TUMHARA_METERED_PASSWORD',
    },
    */
  ],
};

// Optimizes Opus codec parameters for extremely low bandwidth and stability
const optimizeOpusSDP = (sdp) => {
  const lines = sdp.split('\r\n');
  let opusPayloadType = null;
  const modifiedLines = [];

  // 1. Find the Opus payload type (usually 111)
  for (const line of lines) {
    if (line.startsWith('a=rtpmap:') && line.includes('opus/48000')) {
      const match = line.match(/^a=rtpmap:(\d+) /);
      if (match) opusPayloadType = match[1];
    }
  }

  // If Opus isn't found, just return original SDP
  if (!opusPayloadType) return sdp;

  let fmtpFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if it's the specific fmtp line for Opus
    if (line.startsWith(`a=fmtp:${opusPayloadType} `)) {
      fmtpFound = true;
      let params = line.substring(`a=fmtp:${opusPayloadType} `.length);
      const newParams = [];

      // Inject mandatory ultra-low bandwidth params
      if (!params.includes('maxaveragebitrate')) newParams.push('maxaveragebitrate=16000');
      if (!params.includes('cbr')) newParams.push('cbr=1');
      if (!params.includes('fec')) newParams.push('fec=1');
      if (!params.includes('stereo')) newParams.push('stereo=0');
      if (!params.includes('useinbandfec')) newParams.push('useinbandfec=1');

      const combinedParams = newParams.length > 0 ? `${line}; ${newParams.join('; ')}` : line;
      modifiedLines.push(combinedParams);
    } else {
      modifiedLines.push(line);
    }
  }

  // If a=fmtp wasn't in the SDP at all, append it at the end
  if (!fmtpFound) {
    modifiedLines.push(`a=fmtp:${opusPayloadType} maxaveragebitrate=16000; cbr=1; fec=1; useinbandfec=1`);
  }

  // Ensure an empty string is not trailing improperly by matching typical SDP format
  return modifiedLines.join('\r\n');
};


function App() {
  const [inRoom, setInRoom] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');
  const [remoteConnected, setRemoteConnected] = useState(false);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const clientId = useRef(Math.random().toString(36).substring(2, 10)).current;
  const isCreatorRef = useRef(false);
  const iceCandidateQueueRef = useRef([]);

  const audioElementRef = useRef(null);

  useEffect(() => {
    // We need an audio element to play the remote track
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio();
      audioElementRef.current.autoplay = true;
    }
  }, []);

  const initWebRTC = (stream) => {
    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    // Add local tracks to the peer connection
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Handle incoming ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('PeerConnection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setRemoteConnected(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setRemoteConnected(false);
      }
    };

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('Received remote track');
      if (audioElementRef.current) {
        audioElementRef.current.srcObject = event.streams[0];
      }
    };

    return pc;
  };

  const processIceQueue = async (pc) => {
    if (pc && pc.remoteDescription) {
      while (iceCandidateQueueRef.current.length > 0) {
        const candidate = iceCandidateQueueRef.current.shift();
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {
          console.error('Error adding queued ICE candidate', e);
        }
      }
    }
  };

  const connectSignaling = (room) => {
    // 🌐 Production-ready WebSocket URL setup
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Agar Vite dev server (5173) pe hai toh localhost:8000 par bhejo, warna same host use karo (for Render)
    const host = window.location.port === '5173' ? 'localhost:8000' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/${room}/${clientId}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to signaling server');
      // If we joined an existing room, let the creator know we are here
      if (!isCreatorRef.current) {
        sendMessage({ type: 'peer-joined' });
      }
    };

    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log('Received message:', message.type);

      if (!pcRef.current) return;
      const pc = pcRef.current;

      try {
        if (message.type === 'peer-joined') {
          // The other peer joined, create an offer
          console.log('Peer joined, creating offer');
          let offer = await pc.createOffer();

          // Apply Opus optimization to SDP before setting it
          offer.sdp = optimizeOpusSDP(offer.sdp);

          await pc.setLocalDescription(offer);
          sendMessage({ type: 'offer', offer: pc.localDescription });
        }
        else if (message.type === 'offer') {
          console.log('Received offer, creating answer');

          let offerDesc = new RTCSessionDescription(message.offer);
          // Apply optimization to the incoming offer SDP too for robustness
          offerDesc.sdp = optimizeOpusSDP(offerDesc.sdp);
          await pc.setRemoteDescription(offerDesc);
          await processIceQueue(pc);

          let answer = await pc.createAnswer();

          // Apply Opus optimization to local SDP answer
          answer.sdp = optimizeOpusSDP(answer.sdp);

          await pc.setLocalDescription(answer);
          sendMessage({ type: 'answer', answer: pc.localDescription });
        }
        else if (message.type === 'answer') {
          console.log('Received answer');

          let answerDesc = new RTCSessionDescription(message.answer);
          // Apply optimization to incoming answer SDP
          answerDesc.sdp = optimizeOpusSDP(answerDesc.sdp);
          await pc.setRemoteDescription(answerDesc);
          await processIceQueue(pc);
        }
        else if (message.type === 'ice-candidate') {
          console.log('Received ICE candidate');
          if (message.candidate) {
            const candidate = new RTCIceCandidate(message.candidate);
            if (pc.remoteDescription) {
              await pc.addIceCandidate(candidate);
            } else {
              iceCandidateQueueRef.current.push(candidate);
            }
          }
        }
        else if (message.type === 'peer-disconnected') {
          console.log('Peer disconnected');
          setRemoteConnected(false);
          // Restart ICE / prepare for a new peer
          // For simplicity in this demo, we'll just wait for another connection
        }
      } catch (err) {
        console.error('Error handling signaling message:', err);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from signaling server');
    };
  };

  const sendMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const handleJoinOrCreate = async (room, isCreator) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      setRoomId(room);
      setInRoom(true);
      setError('');
      isCreatorRef.current = isCreator;

      initWebRTC(stream);
      connectSignaling(room);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Could not access microphone! Please check your permissions.');
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!localStream.getAudioTracks()[0].enabled);
    }
  };

  const handleLeaveRoom = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setInRoom(false);
    setRoomId('');
    setIsMuted(false);
    setRemoteConnected(false);
    iceCandidateQueueRef.current = [];

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
    }
  };

  return (
    <div className="app-container">
      <div>
        <h1 className="title">VoiceComm</h1>
        <p className="subtitle">Low-Bandwidth Tactical Comms</p>
      </div>

      {error && (
        <div style={{ color: 'var(--danger-color)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {!inRoom ? (
        <RoomManager onJoinOrCreate={handleJoinOrCreate} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
          <div>
            <span className={`status-badge ${remoteConnected ? 'status-connected' : 'status-waiting'}`} style={{
              background: remoteConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              color: remoteConnected ? 'var(--success-color)' : '#fbbf24'
            }}>
              {remoteConnected ? 'Call Active (Opus Low-BW)' : 'Waiting for Peer...'}
            </span>
            <p style={{ marginTop: '0.5rem', fontSize: '1.25rem' }}>Room: <strong>{roomId}</strong></p>
          </div>

          <div className="controls-container">
            <AudioController
              isMuted={isMuted}
              onToggleMute={toggleMute}
            />
          </div>

          <button className="btn btn-danger" onClick={handleLeaveRoom} style={{ marginTop: '1rem' }}>
            Leave Room
          </button>
        </div>
      )}
    </div>
  );
}

export default App;