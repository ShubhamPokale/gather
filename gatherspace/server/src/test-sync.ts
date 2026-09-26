import WebSocket from 'ws';

async function testMultiplayer() {
  const roomId = 'office-1';
  
  console.log('Connecting Client 1 (Alice)...');
  const ws1 = new WebSocket('ws://localhost:8080');
  await new Promise((resolve) => ws1.on('open', resolve));
  console.log('Client 1 connected.');

  let client1SelfId = '';
  let client1Players: Record<string, any> = {};

  ws1.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('[Client 1 received]:', msg.type, msg.payload?.id || msg.payload?.selfId || '');
    if (msg.type === 'INIT_STATE') {
      client1SelfId = msg.payload.selfId;
      client1Players = msg.payload.players;
    } else if (msg.type === 'PLAYER_JOINED') {
      client1Players[msg.payload.id] = msg.payload;
    } else if (msg.type === 'PLAYER_MOVED') {
      if (client1Players[msg.payload.id]) {
        Object.assign(client1Players[msg.payload.id], msg.payload);
      }
    }
  });

  ws1.send(JSON.stringify({
    type: 'JOIN',
    payload: {
      roomId,
      name: 'Alice',
      color: '#6366f1',
      hairColor: '#1e293b'
    }
  }));

  await new Promise((r) => setTimeout(r, 600));

  console.log('\nConnecting Client 2 (Bob)...');
  const ws2 = new WebSocket('ws://localhost:8080');
  await new Promise((resolve) => ws2.on('open', resolve));
  console.log('Client 2 connected.');

  let client2SelfId = '';
  let client2Players: Record<string, any> = {};

  ws2.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('[Client 2 received]:', msg.type, msg.payload?.id || msg.payload?.selfId || '');
    if (msg.type === 'INIT_STATE') {
      client2SelfId = msg.payload.selfId;
      client2Players = msg.payload.players;
    } else if (msg.type === 'PLAYER_JOINED') {
      client2Players[msg.payload.id] = msg.payload;
    } else if (msg.type === 'PLAYER_MOVED') {
      if (client2Players[msg.payload.id]) {
        Object.assign(client2Players[msg.payload.id], msg.payload);
      }
    }
  });

  ws2.send(JSON.stringify({
    type: 'JOIN',
    payload: {
      roomId,
      name: 'Bob',
      color: '#10b981',
      hairColor: '#1e293b'
    }
  }));

  await new Promise((r) => setTimeout(r, 600));

  console.log('\nBob moves to x:500, y:500...');
  ws2.send(JSON.stringify({
    type: 'MOVE',
    payload: {
      x: 500,
      y: 500,
      dir: 'right',
      isMoving: true,
      zoneId: 'lobby'
    }
  }));

  await new Promise((r) => setTimeout(r, 600));

  console.log('\n=== Summary ===');
  console.log('Client 1 selfId:', client1SelfId);
  console.log('Client 1 sees players:', Object.keys(client1Players));
  console.log('Client 2 selfId:', client2SelfId);
  console.log('Client 2 sees players:', Object.keys(client2Players));

  ws1.close();
  ws2.close();
  process.exit(0);
}

testMultiplayer().catch(console.error);
