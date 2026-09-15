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
app.use(express.static(__dirname));

// Ensure data folder exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
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
    // Re-index S.No cleanly
    members.forEach((m, idx) => {
      m.sno = idx + 1;
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(members, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving data file:', err);
  }
}

loadData();

let activeSocketsCount = 0;

// REST API fallback endpoints
app.get('/api/members', (req, res) => {
  res.json({ success: true, members, activeUsers: activeSocketsCount });
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
  
  // Send current state to newly connected client
  socket.emit('init_state', {
    members,
    activeUsers: activeSocketsCount,
    socketId: socket.id
  });

  // Broadcast updated active count to everyone
  io.emit('presence_update', { activeUsers: activeSocketsCount });

  // Handle live cell editing
  socket.on('edit_cell', (data) => {
    const { id, field, value } = data;
    const member = members.find(m => m.id === id);
    if (member && ['memberName', 'familyNames', 'gothram'].includes(field)) {
      member[field] = value;
      member.updatedAt = new Date().toISOString();
      saveData();

      // Broadcast update to all other connected clients immediately
      socket.broadcast.emit('cell_updated', {
        id,
        field,
        value,
        updatedAt: member.updatedAt,
        editedBy: socket.id
      });
    }
  });

  // Broadcast cell focus/editing indicator (shows who is typing where)
  socket.on('typing_focus', (data) => {
    socket.broadcast.emit('remote_typing', {
      socketId: socket.id,
      id: data.id,
      field: data.field,
      isTyping: data.isTyping
    });
  });

  // Handle adding a new row
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

  // Handle deleting a row safely
  socket.on('delete_row', (data) => {
    const { id } = data;
    const index = members.findIndex(m => m.id === id);
    if (index !== -1) {
      members.splice(index, 1);
      // Re-index serial numbers
      members.forEach((m, idx) => { m.sno = idx + 1; });
      saveData();
      io.emit('row_deleted', { id, members });
    }
  });

  // Handle full sync request
  socket.on('request_sync', () => {
    socket.emit('init_state', {
      members,
      activeUsers: activeSocketsCount,
      socketId: socket.id
    });
  });

  socket.on('disconnect', () => {
    activeSocketsCount = Math.max(0, activeSocketsCount - 1);
    console.log(`Client disconnected: ${socket.id} (Total online: ${activeSocketsCount})`);
    io.emit('presence_update', { activeUsers: activeSocketsCount });
  });
});

server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` Ganesh Chaturthi Family Web App is Live! `);
  console.log(` Open in browser: http://localhost:${PORT}`);
  console.log(` Local Network URL: http://<your-ip>:${PORT}`);
  console.log(`===================================================`);
});
