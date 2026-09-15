const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'members.json');

app.use(cors());
app.use(express.json());

// Serve static assets from public/ and root
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Serve index.html explicitly at root URL
app.get('/', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Ensure data folder exists locally
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    // Ignore error in read-only environment
  }
}

// Function to generate initial 100 rows
function generateDefault100Members() {
  const rows = [];
  for (let i = 1; i <= 100; i++) {
    rows.push({
      id: `mem_${i}`,
      sno: i,
      memberName: '',
      familyNames: '',
      gothram: '',
      updatedAt: new Date().toISOString()
    });
  }
  return rows;
}

let members = [];

// Load data from file or initialize defaults
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      members = JSON.parse(content);
      if (!Array.isArray(members) || members.length === 0) {
        members = generateDefault100Members();
        saveData();
      }
    } else {
      members = generateDefault100Members();
      saveData();
    }
  } catch (err) {
    console.error('Error reading data file:', err);
    members = generateDefault100Members();
  }
}

function saveData() {
  try {
    members.forEach((m, idx) => {
      m.sno = idx + 1;
    });
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(members, null, 2), 'utf8');
    } catch (writeErr) {
      // Fallback for Vercel serverless read-only filesystem
      const tmpFile = path.join('/tmp', 'members.json');
      fs.writeFileSync(tmpFile, JSON.stringify(members, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Error saving data file:', err);
  }
}

loadData();

let activeSocketsCount = 0;

// REST API endpoints for Vercel Serverless compatibility
app.get('/api/members', (req, res) => {
  res.json({ success: true, members, activeUsers: Math.max(1, activeSocketsCount) });
});

app.post('/api/members/cell', (req, res) => {
  const { id, field, value } = req.body;
  const member = members.find(m => m.id === id);
  if (member && ['memberName', 'familyNames', 'gothram'].includes(field)) {
    member[field] = value;
    member.updatedAt = new Date().toISOString();
    saveData();
    io.emit('cell_updated', { id, field, value, updatedAt: member.updatedAt });
    return res.json({ success: true, member, members });
  }
  res.status(400).json({ success: false, message: 'Invalid member or field' });
});

app.post('/api/members/add', (req, res) => {
  const newId = `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const newRow = {
    id: newId,
    sno: members.length + 1,
    memberName: '',
    familyNames: '',
    gothram: '',
    updatedAt: new Date().toISOString()
  };
  members.push(newRow);
  saveData();
  io.emit('row_added', { newRow, members });
  res.json({ success: true, newRow, members });
});

app.post('/api/members/delete', (req, res) => {
  const { id } = req.body;
  const index = members.findIndex(m => m.id === id);
  if (index !== -1) {
    members.splice(index, 1);
    members.forEach((m, idx) => { m.sno = idx + 1; });
    saveData();
    io.emit('row_deleted', { id, members });
    return res.json({ success: true, members });
  }
  res.status(404).json({ success: false, message: 'Member not found' });
});

app.post('/api/members', (req, res) => {
  if (Array.isArray(req.body.members)) {
    members = req.body.members;
    saveData();
    io.emit('full_sync', { members, activeUsers: activeSocketsCount });
    return res.json({ success: true, members });
  }
  res.status(400).json({ success: false, message: 'Invalid data format' });
});

// Socket.IO Real-Time Engine
io.on('connection', (socket) => {
  activeSocketsCount++;
  console.log(`Client connected: ${socket.id} (Total online: ${activeSocketsCount})`);
  
  socket.emit('init_state', {
    members,
    activeUsers: activeSocketsCount,
    socketId: socket.id
  });

  io.emit('presence_update', { activeUsers: activeSocketsCount });

  socket.on('edit_cell', (data) => {
    const { id, field, value } = data;
    const member = members.find(m => m.id === id);
    if (member && ['memberName', 'familyNames', 'gothram'].includes(field)) {
      member[field] = value;
      member.updatedAt = new Date().toISOString();
      saveData();

      socket.broadcast.emit('cell_updated', {
        id,
        field,
        value,
        updatedAt: member.updatedAt,
        editedBy: socket.id
      });
    }
  });

  socket.on('typing_focus', (data) => {
    socket.broadcast.emit('remote_typing', {
      socketId: socket.id,
      id: data.id,
      field: data.field,
      isTyping: data.isTyping
    });
  });

  socket.on('add_row', () => {
    const newId = `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newRow = {
      id: newId,
      sno: members.length + 1,
      memberName: '',
      familyNames: '',
      gothram: '',
      updatedAt: new Date().toISOString()
    };
    members.push(newRow);
    saveData();

    io.emit('row_added', { newRow, members });
  });

  socket.on('delete_row', (data) => {
    const { id } = data;
    const index = members.findIndex(m => m.id === id);
    if (index !== -1) {
      members.splice(index, 1);
      members.forEach((m, idx) => { m.sno = idx + 1; });
      saveData();
      io.emit('row_deleted', { id, members });
    }
  });

  socket.on('disconnect', () => {
    activeSocketsCount = Math.max(0, activeSocketsCount - 1);
    console.log(`Client disconnected: ${socket.id} (Total online: ${activeSocketsCount})`);
    io.emit('presence_update', { activeUsers: activeSocketsCount });
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Ganesh Chaturthi Web App running on port ${PORT}`);
  });
}

module.exports = app;
