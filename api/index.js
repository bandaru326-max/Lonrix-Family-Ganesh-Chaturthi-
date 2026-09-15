const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const officeMemberNames = [
  "AKHIL CHELLURI", "ARYA VUPPALA", "AYISHA NASREEN SHARIF", "BHAVANI LANDA",
  "CHAKRADHAR BANDARU", "CHANDINI SANKRANA", "DEEPIKA KOMMOJU", "DIVYA PALLAVI KORADA",
  "DURGA VARA PRASAD CHANDAKA", "GNANESWARI PATHIVADA", "HARIKRISHNA AMARA", "HARITHA NADIMINTI",
  "HITESWAR BOTSA", "INDHU YERRA", "JAGAN KORADA", "JAYASRI BOTTA",
  "JHANSI DHAMODALA", "JYOTHI SWAROOPINI GATTEEM", "KAVYA MATURU", "KHAZA HUSSAIN TRUGUNTA",
  "KELLA DINESH", "LAYA DUKKA", "LEELASUDHA MAMIDI", "MADHURI MUNGARA",
  "MANOJ KUMAR PILLI", "MARIDI BABU HAMSA", "NEELIMA JAMPA", "NIHARIKA REDDY VAKADA",
  "PARIMALA MAHADASU", "PAVAN SURYA KELLA", "RAMYA SRI REDDY", "RITHUSHA MEESALA",
  "SAI SURYA PALASALA", "SAILAJAREDDY BORA", "SANDEEP VUNDRALLA", "SEETHA CHARISHMA",
  "SHYAM KUMAR ADABALA", "TIRUMALA RANI PITTA", "TULASI MANDA", "VASUDHA THIPPAGUDISE",
  "VENKATESH BANDARU", "VENUSAI ALAPATI", "YAMINI MADDILA", "YASWANTH VIJJAPU",
  "YELIYA KUMAR KORADA", "VINODH KUMAR PADALA", "BALA SAI RATNA KUMAR KOMMOJU", "MATCHA SIVA SAI KUMAR",
  "BONI VENKATA MANI", "POTNURI DURGA PRASAD", "SAYYAD SARFARAZ", "REDDY SINDHUJA",
  "PANCHADARLA SARATH KUMAR", "ADAPA SATISH KUMAR", "SADHU CHRISTOPHER", "NIKIHL VELUMURUGAN",
  "KORADA SASI", "T VAMSI"
];

// Function to generate initial 100 rows with 58 pre-filled member names
function generateDefault100Members() {
  const rows = [];
  for (let i = 1; i <= 100; i++) {
    rows.push({
      id: `mem_${i}`,
      sno: i,
      memberName: officeMemberNames[i - 1] || '',
      familyNames: '',
      gothram: '',
      updatedAt: new Date().toISOString()
    });
  }
  return rows;
}

let members = generateDefault100Members();

app.get('/api/members', (req, res) => {
  res.json({ success: true, members, activeUsers: 1 });
});

app.post('/api/members/cell', (req, res) => {
  const { id, field, value } = req.body;
  const member = members.find(m => m.id === id);
  if (member && ['memberName', 'familyNames', 'gothram'].includes(field)) {
    member[field] = value;
    member.updatedAt = new Date().toISOString();
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
  res.json({ success: true, newRow, members });
});

app.post('/api/members/delete', (req, res) => {
  const { id } = req.body;
  const index = members.findIndex(m => m.id === id);
  if (index !== -1) {
    members.splice(index, 1);
    members.forEach((m, idx) => { m.sno = idx + 1; });
    return res.json({ success: true, members });
  }
  res.status(404).json({ success: false, message: 'Member not found' });
});

app.post('/api/members', (req, res) => {
  if (Array.isArray(req.body.members)) {
    members = req.body.members;
    return res.json({ success: true, members });
  }
  res.status(400).json({ success: false, message: 'Invalid data format' });
});

module.exports = app;
