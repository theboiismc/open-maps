const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = 3000;

const UNIFI_BASE_URL = process.env.UNIFI_BASE_URL || 'https://192.168.15.51:8443';
const UNIFI_USERNAME = process.env.UNIFI_USERNAME || 'your_unifi_admin';
const UNIFI_PASSWORD = process.env.UNIFI_PASSWORD || 'your_unifi_password';
const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD || 'roomiepassword';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: true,
}));

app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.send(`
    <form method="POST" action="/login">
      <input type="password" name="password" placeholder="Enter password" required autofocus />
      <button type="submit">Login</button>
    </form>
  `);
});

app.post('/login', (req, res) => {
  if (req.body.password === PORTAL_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.send('Wrong password. <a href="/login">Try again</a>');
  }
});

async function unifiLogin() {
  try {
    const res = await axios.post(`${UNIFI_BASE_URL}/api/login`, {
      username: UNIFI_USERNAME,
      password: UNIFI_PASSWORD,
    }, { httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) });
    return res.headers['set-cookie'];
  } catch (error) {
    console.error('UniFi login failed:', error.message);
    return null;
  }
}

function checkAuth(req, res, next) {
  if (!req.session.authenticated) return res.redirect('/login');
  next();
}

app.get('/', checkAuth, async (req, res) => {
  const cookies = await unifiLogin();
  if (!cookies) return res.send('Error connecting to UniFi Controller');

  try {
    const vlanRes = await axios.get(`${UNIFI_BASE_URL}/proxy/network/api/s/default/rest/networkconf`, {
      headers: { Cookie: cookies.join('; ') },
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    });

    const vlans = vlanRes.data.data;
    let vlanList = '<ul>';
    vlans.forEach(vlan => {
      vlanList += `<li>${vlan.name} - VLAN ID: ${vlan.vlan}</li>`;
    });
    vlanList += '</ul>';

    res.send(`
      <h1>VLANs</h1>
      ${vlanList}
      <h2>Add VLAN</h2>
      <form method="POST" action="/add-vlan">
        <input type="text" name="name" placeholder="VLAN Name" required />
        <input type="number" name="vlan" placeholder="VLAN ID" required />
        <button type="submit">Add VLAN</button>
      </form>
      <br><a href="/logout">Logout</a>
    `);
  } catch (error) {
    res.send('Failed to fetch VLANs: ' + error.message);
  }
});

app.post('/add-vlan', checkAuth, async (req, res) => {
  const cookies = await unifiLogin();
  if (!cookies) return res.send('Error connecting to UniFi Controller');

  const { name, vlan } = req.body;

  try {
    await axios.post(`${UNIFI_BASE_URL}/proxy/network/api/s/default/rest/networkconf`, {
      name,
      vlan: parseInt(vlan, 10),
      purpose: 'corporate',
      enabled: true,
      networkgroup: 'LAN',
    }, {
      headers: { Cookie: cookies.join('; '), 'Content-Type': 'application/json' },
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    });

    res.redirect('/');
  } catch (error) {
    res.send('Failed to add VLAN: ' + error.message);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.listen(PORT, () => {
  console.log(`UniFi Roomie Portal running on http://localhost:${PORT}`);
});
