import React, { useState } from 'react';

export default function RoomManager({ onJoinOrCreate }) {
  const [roomId, setRoomId] = useState('');

  const handleCreate = () => {
    // Generate a simple 6-character room code
    const newRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
    onJoinOrCreate(newRoom, true);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      onJoinOrCreate(roomId.toUpperCase().trim(), false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      <button className="btn btn-primary" onClick={handleCreate} style={{ width: '100%' }}>
        Create New Room
      </button>

      <div className="divider">OR</div>

      <form onSubmit={handleJoin} className="input-group">
        <label htmlFor="roomId">Join existing room</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter Room ID"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={!roomId.trim()}>
            Join
          </button>
        </div>
      </form>
    </div>
  );
}
