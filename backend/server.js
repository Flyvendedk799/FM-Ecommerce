const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ---- API routes ---- */
app.use('/api/suppliers',  require('./routes/suppliers'));
app.use('/api/courses',    require('./routes/courses'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/sessions',   require('./routes/sessions'));
app.use('/api/bookings',   require('./routes/bookings'));
app.get('/api/stats',      (req, res) => res.redirect('/api/bookings/stats/summary'));

/* ---- Admin UI ---- */
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../admin/index.html')));

/* ---- Frontend design files ---- */
app.use('/', express.static(path.join(__dirname, '../project')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../project/Landing.html')));

app.listen(PORT, () => {
  console.log(`\n  Futurematch server running\n`);
  console.log(`  Frontend  →  http://localhost:${PORT}/`);
  console.log(`  Admin     →  http://localhost:${PORT}/admin`);
  console.log(`  API       →  http://localhost:${PORT}/api/\n`);
});
