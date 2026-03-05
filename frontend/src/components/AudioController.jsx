import React from 'react';
import { Mic, MicOff } from 'lucide-react';

export default function AudioController({ isMuted, onToggleMute }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <button
                className={`icon-btn ${isMuted ? 'btn-danger' : 'btn-primary'}`}
                onClick={onToggleMute}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
            >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {isMuted ? 'Muted' : 'Mic On'}
            </span>
        </div>
    );
}
