// ============================================================
//  TerraCapital — Serveur Node.js
//  - Marché global partagé entre tous les joueurs
//  - Timers cultures côté serveur (tournent 24/7)
//  - Auth + sauvegarde Supabase
//  - WebSocket temps réel via Socket.io
//  - Système d'amis MUTUELS avec demandes d'amis
//  - Profils publics avec stats réelles
// ============================================================

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const fetch      = require('node-fetch');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

app.use(express.json());

// Sert les fichiers depuis /public si dispo, sinon depuis la racine
const fs = require('fs');
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
} else {
  app.use(express.static(__dirname));
}

// Route explicite pour index.html
app.get('/', (req, res) => {
  const fromPublic = path.join(__dirname, 'public', 'index.html');
  const fromRoot   = path.join(__dirname, 'index.html');
  if (fs.existsSync(fromPublic)) return res.sendFile(fromPublic);
  if (fs.existsSync(fromRoot))   return res.sendFile(fromRoot);
  res.status(404).send('index.html introuvable — placez-le dans /public/ ou a la racine.');
});

// Health-check endpoint
app.get('/health', (req, res) => res.json({ ok: true, uptime: Math.floor(process.uptime()) + 's' }));

// ===== SUPABASE =====
const SB_URL = process.env.SUPABASE_URL || 'https://xhhdzconcmmcxwcqzejx.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_YRO5_plGZlX93pd0QByTMg_gi6iOucx';

function sbFetch(path, method, body) {
  const headers = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    'Prefer': ''
  };
  const m = method || 'GET';
  if (m === 'POST' || m === 'PATCH') headers['Prefer'] = 'return=representation';
  if (m === 'POST' && (path.startsWith('friendships') || path.startsWith('friend_requests'))) headers['Prefer'] = 'resolution=ignore-duplicates,return=representation';
  if (m === 'DELETE') headers['Prefer'] = '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  return fetch(SB_URL + '/rest/v1/' + path, {
    method: m,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: controller.signal
  })
  .then(async r => {
    clearTimeout(timeout);
    const text = await r.text().catch(() => '');
    if (!r.ok) {
      console.error('sbFetch HTTP ' + r.status + ' [' + m + ' ' + path + ']:', text.slice(0, 300));
      return null;
    }
    if (!text) return null;
    try { return JSON.parse(text); } catch(e) { return null; }
  })
  .catch(err => {
    clearTimeout(timeout);
    console.error('sbFetch error [' + m + ' ' + path + ']:', err.message || err);
    return null;
  });
}

// ===== CONSTANTES JEUX =====
const COM         = 0.03;
const IMPORT_RATE = 0.25;

const SEEDS = [
  // ── EUROPE ──
  {id:'wheat',       nm:'Blé',                  ico:'🌾', pr:0.05,  gMs:180000,    hMs:72000,    bv:0.0560, reg:'Europe'},
  {id:'carrot',      nm:'Carotte',              ico:'🥕', pr:0.08,  gMs:300000,    hMs:120000,   bv:0.0897, reg:'Europe'},
  {id:'tomato',      nm:'Tomate',               ico:'🍅', pr:0.18,  gMs:900000,    hMs:360000,   bv:0.2023, reg:'Europe'},
  {id:'grape',       nm:'Raisin',               ico:'🍇', pr:0.45,  gMs:3600000,   hMs:1200000,  bv:0.5115, reg:'Europe'},
  {id:'olive',       nm:'Olive',                ico:'🫒', pr:3.50,  gMs:86400000,  hMs:28800000, bv:5.3200, reg:'Europe'},
  {id:'potato',      nm:'Pomme de terre',       ico:'🥔', pr:0.07,  gMs:240000,    hMs:96000,    bv:0.0785, reg:'Europe'},
  {id:'lemon',       nm:'Citron',               ico:'🍋', pr:0.35,  gMs:2700000,   hMs:900000,   bv:0.3964, reg:'Europe'},
  {id:'peach',       nm:'Pêche',                ico:'🍑', pr:0.70,  gMs:9000000,   hMs:3000000,  bv:0.8132, reg:'Europe'},
  {id:'garlic',      nm:'Ail',                  ico:'🧄', pr:0.15,  gMs:720000,    hMs:300000,   bv:0.1685, reg:'Europe'},
  {id:'onion',       nm:'Oignon',               ico:'🧅', pr:0.10,  gMs:480000,    hMs:180000,   bv:0.1122, reg:'Europe'},
  {id:'strawberry',  nm:'Fraise',               ico:'🍓', pr:0.28,  gMs:1600000,   hMs:540000,   bv:0.3157, reg:'Europe'},
  {id:'cherry',      nm:'Cerise',               ico:'🍒', pr:0.55,  gMs:5400000,   hMs:1800000,  bv:0.6298, reg:'Europe'},
  {id:'apple',       nm:'Pomme',                ico:'🍎', pr:0.40,  gMs:3200000,   hMs:1080000,  bv:0.4539, reg:'Europe'},
  {id:'pear',        nm:'Poire',                ico:'🍐', pr:0.42,  gMs:3600000,   hMs:1200000,  bv:0.4774, reg:'Europe'},
  {id:'sunflower',   nm:'Tournesol',            ico:'🌻', pr:0.22,  gMs:1200000,   hMs:480000,   bv:0.2476, reg:'Europe'},
  {id:'lavender',    nm:'Lavande',              ico:'💜', pr:1.80,  gMs:32400000,  hMs:10800000, bv:2.2860, reg:'Europe'},
  {id:'truffle',     nm:'Truffe',               ico:'🍄', pr:8.00,  gMs:259200000, hMs:86400000, bv:18.5600,reg:'Europe'},
  {id:'saffron',     nm:'Safran',               ico:'🌸', pr:12.00, gMs:432000000, hMs:144000000,bv:37.4400,reg:'Europe'},
  {id:'raspberry',   nm:'Framboise',            ico:'🫐', pr:0.65,  gMs:7200000,   hMs:2400000,  bv:0.7497, reg:'Europe'},
  {id:'blueberry',   nm:'Myrtille',             ico:'🫐', pr:0.80,  gMs:10800000,  hMs:3600000,  bv:0.9360, reg:'Europe'},
  {id:'mushroom',    nm:'Champignon',           ico:'🍄', pr:0.50,  gMs:4500000,   hMs:1500000,  bv:0.5704, reg:'Europe'},
  {id:'mint',        nm:'Menthe',               ico:'🌿', pr:0.12,  gMs:600000,    hMs:240000,   bv:0.1347, reg:'Europe'},
  {id:'thyme',       nm:'Thym',                 ico:'🌱', pr:0.20,  gMs:1080000,   hMs:360000,   bv:0.2250, reg:'Europe'},
  {id:'rosemary',    nm:'Romarin',              ico:'🌿', pr:0.25,  gMs:1440000,   hMs:480000,   bv:0.2817, reg:'Europe'},
  {id:'fig',         nm:'Figue',                ico:'🫒', pr:1.10,  gMs:18000000,  hMs:6000000,  bv:1.3237, reg:'Europe'},
  {id:'hemp',        nm:'Chanvre',              ico:'🌿', pr:0.90,  gMs:12600000,  hMs:4200000,  bv:1.0605, reg:'Europe'},
  {id:'barley',      nm:'Orge',                 ico:'🌾', pr:0.06,  gMs:210000,    hMs:84000,    bv:0.0673, reg:'Europe'},
  {id:'rye',         nm:'Seigle',               ico:'🌾', pr:0.07,  gMs:240000,    hMs:96000,    bv:0.0785, reg:'Europe'},
  // ── ASIE ──
  {id:'rice',        nm:'Riz',                  ico:'🍚', pr:0.12,  gMs:1800000,   hMs:600000,   bv:0.1354, reg:'Asie'},
  {id:'pepper',      nm:'Piment',               ico:'🌶️', pr:0.60,  gMs:7200000,   hMs:2400000,  bv:0.6920, reg:'Asie'},
  {id:'mango',       nm:'Mangue',               ico:'🥭', pr:0.55,  gMs:4800000,   hMs:1600000,  bv:0.6282, reg:'Asie'},
  {id:'eggplant',    nm:'Aubergine',            ico:'🍆', pr:0.25,  gMs:1500000,   hMs:600000,   bv:0.2817, reg:'Asie'},
  {id:'coconut',     nm:'Noix de coco',         ico:'🥥', pr:0.90,  gMs:14400000,  hMs:4800000,  bv:1.0680, reg:'Asie'},
  {id:'lychee',      nm:'Litchi',               ico:'🍒', pr:1.40,  gMs:21600000,  hMs:7200000,  bv:1.7080, reg:'Asie'},
  {id:'durian',      nm:'Durian',               ico:'🌵', pr:2.20,  gMs:43200000,  hMs:14400000, bv:2.9040, reg:'Asie'},
  {id:'ginger',      nm:'Gingembre',            ico:'🫚', pr:0.45,  gMs:3600000,   hMs:1200000,  bv:0.5115, reg:'Asie'},
  {id:'turmeric',    nm:'Curcuma',              ico:'🟡', pr:0.80,  gMs:10800000,  hMs:3600000,  bv:0.9360, reg:'Asie'},
  {id:'bamboo',      nm:'Bambou',               ico:'🎋', pr:0.30,  gMs:2700000,   hMs:900000,   bv:0.3397, reg:'Asie'},
  {id:'tea',         nm:'Thé',                  ico:'🍵', pr:1.50,  gMs:25200000,  hMs:8400000,  bv:1.8550, reg:'Asie'},
  {id:'jasmine',     nm:'Jasmin',               ico:'🌸', pr:2.80,  gMs:57600000,  hMs:19200000, bv:3.8827, reg:'Asie'},
  {id:'longan',      nm:'Longan',               ico:'🍇', pr:1.20,  gMs:18000000,  hMs:6000000,  bv:1.4440, reg:'Asie'},
  {id:'rambutan',    nm:'Ramboutan',            ico:'🔴', pr:1.80,  gMs:32400000,  hMs:10800000, bv:2.2860, reg:'Asie'},
  {id:'starfruit',   nm:'Carambole',            ico:'⭐', pr:1.10,  gMs:16200000,  hMs:5400000,  bv:1.3145, reg:'Asie'},
  {id:'papaya',      nm:'Papaye',               ico:'🧡', pr:0.35,  gMs:2700000,   hMs:900000,   bv:0.3964, reg:'Asie'},
  {id:'dragon',      nm:'Pitaya',               ico:'🐉', pr:2.50,  gMs:50400000,  hMs:16800000, bv:3.3833, reg:'Asie'},
  {id:'wasabi',      nm:'Wasabi',               ico:'🥬', pr:5.00,  gMs:151200000, hMs:50400000, bv:9.1000, reg:'Asie'},
  {id:'cardamom',    nm:'Cardamome',            ico:'🫛', pr:4.00,  gMs:108000000, hMs:36000000, bv:6.4800, reg:'Asie'},
  {id:'clove',       nm:'Clou de girofle',      ico:'🌰', pr:3.00,  gMs:72000000,  hMs:24000000, bv:4.3600, reg:'Asie'},
  {id:'sesame',      nm:'Sésame',               ico:'🌾', pr:0.18,  gMs:1080000,   hMs:360000,   bv:0.2025, reg:'Asie'},
  {id:'lotus',       nm:'Lotus',                ico:'🪷', pr:1.60,  gMs:28800000,  hMs:9600000,  bv:2.0053, reg:'Asie'},
  {id:'tofu',        nm:'Soja',                 ico:'🫘', pr:0.14,  gMs:720000,    hMs:288000,   bv:0.1573, reg:'Asie'},
  {id:'persimmon',   nm:'Kaki',                 ico:'🍊', pr:0.70,  gMs:9000000,   hMs:3000000,  bv:0.8132, reg:'Asie'},
  // ── AMÉRIQUES ──
  {id:'corn',        nm:'Maïs',                 ico:'🌽', pr:0.30,  gMs:5400000,   hMs:1800000,  bv:0.3435, reg:'Amériques'},
  {id:'avocado',     nm:'Avocat',               ico:'🥑', pr:1.20,  gMs:21600000,  hMs:7200000,  bv:1.4640, reg:'Amériques'},
  {id:'coffee',      nm:'Café',                 ico:'☕', pr:2.00,  gMs:43200000,  hMs:14400000, bv:2.6400, reg:'Amériques'},
  {id:'banana',      nm:'Banane',               ico:'🍌', pr:0.22,  gMs:1200000,   hMs:480000,   bv:0.2476, reg:'Amériques'},
  {id:'pumpkin',     nm:'Citrouille',           ico:'🎃', pr:0.40,  gMs:3200000,   hMs:1100000,  bv:0.4539, reg:'Amériques'},
  {id:'cacao',       nm:'Cacao',                ico:'🍫', pr:2.50,  gMs:64800000,  hMs:21600000, bv:3.5500, reg:'Amériques'},
  {id:'pineapple',   nm:'Ananas',               ico:'🍍', pr:0.45,  gMs:3960000,   hMs:1320000,  bv:0.5122, reg:'Amériques'},
  {id:'manioc',      nm:'Manioc',               ico:'🪵', pr:0.16,  gMs:900000,    hMs:360000,   bv:0.1799, reg:'Amériques'},
  {id:'sweet_potato',nm:'Patate douce',         ico:'🍠', pr:0.13,  gMs:660000,    hMs:264000,   bv:0.1460, reg:'Amériques'},
  {id:'quinoa',      nm:'Quinoa',               ico:'🌾', pr:0.85,  gMs:12600000,  hMs:4200000,  bv:1.0016, reg:'Amériques'},
  {id:'acai',        nm:'Açaï',                 ico:'🫐', pr:3.20,  gMs:79200000,  hMs:26400000, bv:4.7573, reg:'Amériques'},
  {id:'mate',        nm:'Maté',                 ico:'🧉', pr:1.10,  gMs:18000000,  hMs:6000000,  bv:1.3237, reg:'Amériques'},
  {id:'vanilla',     nm:'Vanille',              ico:'🌼', pr:6.00,  gMs:172800000, hMs:57600000, bv:11.5200,reg:'Amériques'},
  {id:'passion',     nm:'Fruit de la passion',  ico:'💛', pr:1.30,  gMs:20700000,  hMs:6900000,  bv:1.5806, reg:'Amériques'},
  {id:'paprika',     nm:'Paprika',              ico:'🌶️', pr:0.75,  gMs:10080000,  hMs:3360000,  bv:0.8750, reg:'Amériques'},
  {id:'pecan',       nm:'Pécan',                ico:'🌰', pr:1.90,  gMs:36000000,  hMs:12000000, bv:2.4447, reg:'Amériques'},
  {id:'blueberry2',  nm:'Bleuet',               ico:'🫐', pr:0.95,  gMs:14400000,  hMs:4800000,  bv:1.1273, reg:'Amériques'},
  {id:'maple',       nm:"Sirop d'érable",       ico:'🍁', pr:4.50,  gMs:129600000, hMs:43200000, bv:7.7400, reg:'Amériques'},
  {id:'cranberry',   nm:'Canneberge',           ico:'🍒', pr:1.00,  gMs:16200000,  hMs:5400000,  bv:1.1950, reg:'Amériques'},
  {id:'tobacco',     nm:'Tabac',                ico:'🍂', pr:1.70,  gMs:30600000,  hMs:10200000, bv:2.1448, reg:'Amériques'},
  {id:'rubber',      nm:'Hévéa',                ico:'🌳', pr:2.30,  gMs:50400000,  hMs:16800000, bv:3.1127, reg:'Amériques'},
  {id:'guarana',     nm:'Guarana',              ico:'🔴', pr:2.80,  gMs:64800000,  hMs:21600000, bv:3.9760, reg:'Amériques'},
  // ── AFRIQUE ──
  {id:'baobab',      nm:'Baobab',               ico:'🌳', pr:4.00,  gMs:108000000, hMs:36000000, bv:6.4800, reg:'Afrique'},
  {id:'kola',        nm:'Cola',                 ico:'🌰', pr:1.50,  gMs:25200000,  hMs:8400000,  bv:1.8550, reg:'Afrique'},
  {id:'shea',        nm:'Karité',               ico:'🫧', pr:2.00,  gMs:43200000,  hMs:14400000, bv:2.6400, reg:'Afrique'},
  {id:'moringa',     nm:'Moringa',              ico:'🌿', pr:2.50,  gMs:57600000,  hMs:19200000, bv:3.4667, reg:'Afrique'},
  {id:'rooibos',     nm:'Rooibos',              ico:'🍵', pr:1.80,  gMs:32400000,  hMs:10800000, bv:2.2860, reg:'Afrique'},
  {id:'argan',       nm:'Argan',                ico:'🌰', pr:5.50,  gMs:162000000, hMs:54000000, bv:10.2850,reg:'Afrique'},
  {id:'millet',      nm:'Mil',                  ico:'🌾', pr:0.08,  gMs:360000,    hMs:144000,   bv:0.0897, reg:'Afrique'},
  {id:'sorghum',     nm:'Sorgho',               ico:'🌾', pr:0.09,  gMs:420000,    hMs:168000,   bv:0.1010, reg:'Afrique'},
  {id:'yam',         nm:'Igname',               ico:'🍠', pr:0.30,  gMs:2520000,   hMs:840000,   bv:0.3395, reg:'Afrique'},
  {id:'okra',        nm:'Gombo',                ico:'🫑', pr:0.20,  gMs:1260000,   hMs:420000,   bv:0.2252, reg:'Afrique'},
  {id:'hibiscus',    nm:'Hibiscus',             ico:'🌺', pr:1.20,  gMs:18000000,  hMs:6000000,  bv:1.4440, reg:'Afrique'},
  {id:'enset',       nm:'Faux bananier',        ico:'🍌', pr:0.50,  gMs:4500000,   hMs:1500000,  bv:0.5704, reg:'Afrique'},
  {id:'njansang',    nm:'Njansang',             ico:'🌰', pr:3.00,  gMs:72000000,  hMs:24000000, bv:4.3600, reg:'Afrique'},
  {id:'teff',        nm:'Teff',                 ico:'🌾', pr:0.60,  gMs:6300000,   hMs:2100000,  bv:0.6895, reg:'Afrique'},
  {id:'fonio',       nm:'Fonio',                ico:'🌾', pr:0.70,  gMs:7560000,   hMs:2520000,  bv:0.8085, reg:'Afrique'},
  {id:'sheanut',     nm:'Noix de palme',        ico:'🌴', pr:0.80,  gMs:10800000,  hMs:3600000,  bv:0.9360, reg:'Afrique'},
  // ── OCÉANIE ──
  {id:'macadamia',   nm:'Macadamia',            ico:'🌰', pr:3.50,  gMs:86400000,  hMs:28800000, bv:5.3200, reg:'Océanie'},
  {id:'tamarillo',   nm:'Tamarillo',            ico:'🍅', pr:1.40,  gMs:21600000,  hMs:7200000,  bv:1.7080, reg:'Océanie'},
  {id:'feijoa',      nm:'Feijoa',               ico:'🍈', pr:1.10,  gMs:16200000,  hMs:5400000,  bv:1.3145, reg:'Océanie'},
  {id:'quandong',    nm:'Quandong',             ico:'🍑', pr:2.00,  gMs:43200000,  hMs:14400000, bv:2.6400, reg:'Océanie'},
  {id:'kangaroo_apple',nm:'Pomme kangourou',    ico:'🍏', pr:1.80,  gMs:32400000,  hMs:10800000, bv:2.2860, reg:'Océanie'},
  {id:'wattleseed',  nm:"Graine d'acacia",      ico:'🌰', pr:2.20,  gMs:46800000,  hMs:15600000, bv:2.9407, reg:'Océanie'},
  {id:'lemon_myrtle',nm:'Myrte citronnée',      ico:'🍋', pr:3.20,  gMs:79200000,  hMs:26400000, bv:4.7573, reg:'Océanie'},
  {id:'bunya',       nm:'Bunya',                ico:'🌲', pr:2.80,  gMs:64800000,  hMs:21600000, bv:3.9760, reg:'Océanie'},
  {id:'davidson',    nm:"Prune de Davidson",    ico:'🔵', pr:4.00,  gMs:108000000, hMs:36000000, bv:6.4800, reg:'Océanie'},
  {id:'munthari',    nm:'Munthari',             ico:'🫐', pr:3.50,  gMs:86400000,  hMs:28800000, bv:5.3200, reg:'Océanie'},
];

const PLOT_PRICES = [0, 1.00, 2.50, 5.00, 9.00, 14.00, 20.00, 28.00, 38.00, 50.00];

const EVENTS = [
  // Normaux Europe
  {txt:'🌵 Sécheresse Europe — céréales +40%',              crops:['wheat','grape','carrot','olive','barley','rye'],  m:1.40, crash:false},
  {txt:'🚢 Crise logistique mondiale — tout +20%',          crops:null,                                               m:1.20, crash:false},
  {txt:'📉 Surplus mondial blé — blé et orge −30%',         crops:['wheat','barley','rye'],                          m:0.70, crash:false},
  {txt:'🧊 Gel tardif — tomates, cerises et fraises −25%',  crops:['tomato','cherry','strawberry','peach'],           m:0.75, crash:false},
  {txt:'🌹 Boom herbes aromatiques — lavande +60%',         crops:['lavender','mint','thyme','rosemary'],             m:1.60, crash:false},
  {txt:'🍄 Folie truffes — truffes et champignons +80%',    crops:['truffle','mushroom'],                             m:1.80, crash:false},
  {txt:'🫒 Tendance méditerranéenne — olives et figues +45%',crops:['olive','fig','grape','lemon'],                   m:1.45, crash:false},
  // Normaux Asie
  {txt:'☕ Boom café en Asie — café +65%',                  crops:['coffee','tea'],                                   m:1.65, crash:false},
  {txt:'🔥 Canicule — piments et paprika très demandés +50%',crops:['pepper','paprika','ginger'],                     m:1.50, crash:false},
  {txt:'🍵 Mode bien-être — thé, curcuma et jasmin +55%',   crops:['tea','turmeric','jasmine','lotus'],               m:1.55, crash:false},
  {txt:'🐉 Pitaya viral en Occident — pitaya +70%',         crops:['dragon','lychee','rambutan'],                     m:1.70, crash:false},
  {txt:'🌶️ Cuisine épicée tendance — cardamome et clou +50%',crops:['cardamom','clove','wasabi','pepper'],            m:1.50, crash:false},
  // Normaux Amériques
  {txt:'🥑 Tendance santé — avocat et quinoa +35%',         crops:['avocado','quinoa','acai'],                        m:1.35, crash:false},
  {txt:'🍫 Prix cacao mondial — cacao et vanille +55%',     crops:['cacao','vanilla'],                                m:1.55, crash:false},
  {txt:'🌽 Éthanol : demande maïs +40%',                    crops:['corn','sugarcane','manioc'],                      m:1.40, crash:false},
  {txt:'🍁 Ruée sirop — érable et canneberge +60%',         crops:['maple','cranberry','blueberry2'],                 m:1.60, crash:false},
  {txt:'☕ Révolution guarana — guarana et maté +65%',       crops:['guarana','mate','acai'],                          m:1.65, crash:false},
  {txt:'🍌 Pénurie bananes mondiales — banane +45%',         crops:['banana','pineapple','passion'],                   m:1.45, crash:false},
  // Normaux Afrique
  {txt:'🌍 Sommet climatique — marchés volatils +25%',       crops:null,                                               m:1.25, crash:false},
  {txt:'🌿 Boom cosmétique — argan et karité +70%',          crops:['argan','shea','moringa','baobab'],                m:1.70, crash:false},
  {txt:'🍵 Mode rooibos mondiale — rooibos +55%',            crops:['rooibos','hibiscus','kola'],                      m:1.55, crash:false},
  {txt:'🌾 Aide alimentaire — mil et sorgho demandés +30%',  crops:['millet','sorghum','teff','fonio'],                m:1.30, crash:false},
  // Normaux Océanie
  {txt:'🌰 Macadamia en vogue — noix premium +60%',          crops:['macadamia','wattleseed','bunya'],                 m:1.60, crash:false},
  {txt:'🔵 Superfruits australiens — davidson et munthari +75%',crops:['davidson','munthari','quandong'],              m:1.75, crash:false},
  // Pluies / global
  {txt:'🌧️ Pluies record — riz, maïs et manioc +30%',        crops:['rice','corn','manioc','yam'],                    m:1.30, crash:false},
  {txt:'❄️ Hiver précoce — café, cacao et vanille en tension', crops:['coffee','cacao','vanilla'],                    m:1.45, crash:false},
  {txt:'🌸 Spéculation safran — cours s\'envole +120%',       crops:['saffron'],                                        m:2.20, crash:false},
  {txt:'📉 Surproduction safran iranien — safran −60%',       crops:['saffron'],                                        m:0.40, crash:false},
  {txt:'🌸 Safran contrefait découvert — cours s\'effondre −70%', crops:['saffron'],                                    m:0.30, crash:true},
  {txt:'💰 Enchères mondiales — safran et vanille +90%',      crops:['saffron','vanilla'],                              m:1.90, crash:false},
  // CRASH
  {txt:'💥 CRASH — Surproduction mondiale : tout −50%',      crops:null,                                               m:0.50, crash:true},
  {txt:'🦟 Épidémie de ravageurs — légumes −60%',            crops:['carrot','tomato','pepper','eggplant','okra'],     m:0.40, crash:true},
  {txt:'📉 Crise financière — matières premières −45%',      crops:null,                                               m:0.55, crash:true},
  {txt:'🌊 Inondations — céréales et riz −55%',              crops:['wheat','rice','corn','barley','rye','millet'],    m:0.45, crash:true},
  {txt:'🧫 Contamination — café, cacao et vanille −65%',     crops:['coffee','cacao','vanilla','tea'],                 m:0.35, crash:true},
  {txt:'🏜️ Sécheresse Afrique — récoltes sahéliennes −50%',  crops:['millet','sorghum','teff','fonio','baobab'],      m:0.50, crash:true},
  {txt:'🌪️ Cyclone tropical — fruits exotiques −60%',        crops:['mango','coconut','banana','pineapple','papaya'], m:0.40, crash:true},
  {txt:'🧊 Grand gel — fruits européens −45%',               crops:['grape','apple','pear','cherry','peach'],          m:0.55, crash:true},
  {txt:'🐀 Infestation — épices asiatiques −55%',            crops:['pepper','ginger','cardamom','clove','wasabi'],    m:0.45, crash:true},
  {txt:'🌋 Éruption — Océanie paralysée −60%',               crops:['macadamia','davidson','munthari','feijoa'],       m:0.40, crash:true},
];

const BOOSTS = [
  {id:'water_prem', nm:'Hormone de croissance ×5', ico:'⚗️', pr:0.30, effect:'speed', val:0.20, qty:5},
  {id:'fert_boost', nm:'Engrais premium ×3',       ico:'🌿', pr:0.50, effect:'yield', val:0.35, qty:3},
  {id:'pesticide',  nm:'Pesticide ×1',             ico:'🛡️', pr:0.20, effect:'pest',  val:2.0,  qty:1},
];

const INIT_SEED = {id:'init', nm:'Graine spéciale', ico:'✨', pr:0, gMs:180000, hMs:120000, bv:0, reg:'Init'};

// ===== GRAINES DE MUTATION (plantables après déblocage) =====
// Chaque mutation débloquée crée une graine mut_* récoltable et vendable aux enchères
const MUTATION_SEEDS = [
  {id:'mut_goldwheat',    nm:'Blé Doré',           ico:'✨🌾', bv:3.50,  gMs:540000,    hMs:216000,   reg:'Mutation', desc:'Rendement ×1.5 — mutation du Blé'},
  {id:'mut_supertom',     nm:'Super Tomate',        ico:'💪🍅', bv:4.20,  gMs:675000,    hMs:270000,   reg:'Mutation', desc:'Pousse −25% plus vite — mutation de la Tomate'},
  {id:'mut_crystalgrape', nm:'Raisin Cristal',      ico:'💎🍇', bv:9.00,  gMs:2700000,   hMs:900000,   reg:'Mutation', desc:'Prix ×2 en boom — mutation du Raisin'},
  {id:'mut_goldenolive',  nm:'Olive d\'Or',         ico:'🏅🫒', bv:7.50,  gMs:64800000,  hMs:21600000, reg:'Mutation', desc:'Prix de base +50% — mutation de l\'Olive'},
  {id:'mut_silvertruffle',nm:'Truffe Argentée',     ico:'🥈🍄', bv:18.00, gMs:194400000, hMs:64800000, reg:'Mutation', desc:'Ne pourrit jamais — mutation de la Truffe'},
  {id:'mut_royalsaffron', nm:'Safran Royal',        ico:'👑🌸', bv:28.00, gMs:324000000, hMs:108000000,reg:'Mutation', desc:'Prix garanti +80% — mutation du Safran'},
  {id:'mut_firepep',      nm:'Piment Infernal',     ico:'🔥🌶️', bv:5.60,  gMs:5400000,   hMs:1800000,  reg:'Mutation', desc:'Prix +40% — mutation du Piment'},
  {id:'mut_neonrice',     nm:'Riz Néon',            ico:'🌈🍚', bv:3.80,  gMs:1350000,   hMs:450000,   reg:'Mutation', desc:'Revenu garanti — mutation du Riz'},
  {id:'mut_rainforest',   nm:'Café Sauvage',        ico:'🌿☕', bv:6.50,  gMs:32400000,  hMs:10800000, reg:'Mutation', desc:'Fenêtre ×2 — mutation du Café'},
  {id:'mut_goldtea',      nm:'Thé d\'Or',           ico:'✨🍵', bv:8.00,  gMs:18900000,  hMs:6300000,  reg:'Mutation', desc:'Prix +60% — mutation du Thé'},
  {id:'mut_dragonfire',   nm:'Pitaya Feu',          ico:'🔥🐉', bv:12.00, gMs:37800000,  hMs:12600000, reg:'Mutation', desc:'Immunisé crash — mutation du Pitaya'},
  {id:'mut_goldenspice',  nm:'Épice Légendaire',    ico:'⚡🫛', bv:11.00, gMs:81000000,  hMs:27000000, reg:'Mutation', desc:'Coût −40% — mutation de la Cardamome'},
  {id:'mut_pearlavoc',    nm:'Avocat Perle',        ico:'🫧🥑', bv:5.80,  gMs:16200000,  hMs:5400000,  reg:'Mutation', desc:'Coût −30% — mutation de l\'Avocat'},
  {id:'mut_stonecorn',    nm:'Maïs de Pierre',      ico:'🪨🌽', bv:4.50,  gMs:4050000,   hMs:1350000,  reg:'Mutation', desc:'Ne pourrit jamais — mutation du Maïs'},
  {id:'mut_darkcacao',    nm:'Cacao des Ombres',    ico:'🌑🍫', bv:11.00, gMs:48600000,  hMs:16200000, reg:'Mutation', desc:'Prix +60% — mutation du Cacao'},
  {id:'mut_sacredvanilla',nm:'Vanille Sacrée',      ico:'🌟🌼', bv:20.00, gMs:129600000, hMs:43200000, reg:'Mutation', desc:'Rendement ×2 — mutation de la Vanille'},
  {id:'mut_desertargan',  nm:'Argan du Désert',     ico:'🏜️🌰', bv:14.00, gMs:121500000, hMs:40500000, reg:'Mutation', desc:'Résiste au climat — mutation de l\'Argan'},
  {id:'mut_ancientbaobab',nm:'Baobab Ancestral',    ico:'🌍🌳', bv:16.00, gMs:81000000,  hMs:27000000, reg:'Mutation', desc:'Fenêtre ×3 — mutation du Baobab'},
  {id:'mut_goldenMac',    nm:'Macadamia d\'Or',     ico:'🥇🌰', bv:18.00, gMs:64800000,  hMs:21600000, reg:'Mutation', desc:'Prix +70% — mutation de la Macadamia'},
  {id:'mut_dreamdavidson',nm:'Prune Rêveuse',       ico:'💜🔵', bv:15.00, gMs:81000000,  hMs:27000000, reg:'Mutation', desc:'Pousse +30% vite — mutation de la Prune Davidson'},
];

// Helper : trouver n'importe quelle graine (normale + exclusive + mutation + coop)
function findAnySeed(id) {
  return SEEDS.find(s => s.id === id)
    || AUCTION_EXCLUSIVE_SEEDS.find(s => s.id === id)
    || MUTATION_SEEDS.find(s => s.id === id)
    || COOP_SEEDS.find(s => s.id === id)
    || (id === 'init' ? INIT_SEED : null);
}

// ===== GRAINES EXCLUSIVES COOPERATIVES =====
const COOP_SEEDS = [
  {id:'coop_aureum',    nm:'Blé Doré',         ico:'🌟', pr:0.80,  gMs:600000,    hMs:240000,   bv:2.80,  desc:'Hybride légendaire, cultivé uniquement en coopérative'},
  {id:'coop_crystal',  nm:'Rose Cristal',      ico:'💎', pr:1.50,  gMs:1800000,   hMs:600000,   bv:6.20,  desc:'Fleur aux pétales de cristal, pousse en symbiose'},
  {id:'coop_moon',     nm:'Champignon Lunaire',ico:'🌙', pr:2.00,  gMs:3600000,   hMs:1200000,  bv:9.50,  desc:'Pousse uniquement sous la lumière collective des équipes'},
  {id:'coop_dragon',   nm:'Piment Dragon',     ico:'🔥', pr:1.20,  gMs:900000,    hMs:360000,   bv:4.80,  desc:'Variété mythique qui nécessite plusieurs mains expertes'},
  {id:'coop_aurora',   nm:'Baie Aurore',       ico:'🌈', pr:3.00,  gMs:7200000,   hMs:2400000,  bv:14.40, desc:'Fruit rarissime aux reflets irisés, secret de guilde'},
  {id:'coop_obsidian', nm:'Truffe Obsidienne', ico:'⚫', pr:4.00,  gMs:14400000,  hMs:4800000,  bv:22.00, desc:'La plus précieuse des truffes, pousse en profondeur collective'},
  {id:'coop_jade',     nm:'Melon de Jade',     ico:'🟢', pr:1.80,  gMs:2700000,   hMs:900000,   bv:7.60,  desc:'Fruit sacré qui requiert la sagesse de plusieurs agriculteurs'},
  {id:'coop_phoenix',  nm:'Safran Phénix',     ico:'🦅', pr:5.00,  gMs:21600000,  hMs:7200000,  bv:28.50, desc:'Épice légendaire renaissant des cendres de la coopération'},
];

// ===== FERMES COOPERATIVES =====
// coopFarms[farmId] = { id, name, leader, members, invites, plots, harvested, logs, createdAt }
const coopFarms = {};

// Boucle pour faire pousser les cultures coop
setInterval(() => {
  const now = Date.now();
  Object.values(coopFarms).forEach(farm => {
    let changed = false;
    farm.plots.forEach(p => {
      if (!p.planted || p.st === 'empty' || p.st === 'ready' || p.st === 'rotting') return;
      const seed = COOP_SEEDS.find(s => s.id === p.crop);
      if (!seed) return;
      const el = now - p.planted;
      if (p.st === 'growing' && el >= seed.gMs) {
        p.st = 'ready'; changed = true;
        farm.logs.unshift({ t: new Date().toLocaleTimeString('fr'), txt: seed.ico + ' ' + seed.nm + ' est prête à récolter !', cls:'ok' });
        if (farm.logs.length > 50) farm.logs.pop();
      } else if (p.st === 'ready' && el >= seed.gMs + seed.hMs) {
        p.st = 'rotting'; changed = true;
        farm.logs.unshift({ t: new Date().toLocaleTimeString('fr'), txt: seed.ico + ' ' + seed.nm + ' a pourri !', cls:'neg' });
        if (farm.logs.length > 50) farm.logs.pop();
      }
    });
    if (changed) {
      farm.members.forEach(m => {
        const s = Object.values(sessions).find(sess => sess.username === m);
        if (s) io.to(s.socketId).emit('coop_update', farm);
      });
    }
  });
}, 5000);


// ===== ÉTAT GLOBAL SERVEUR =====
const globalMarket = {};
SEEDS.forEach(s => { globalMarket[s.id] = s.bv * (0.93 + Math.random() * 0.14); });

// ===== PRESSION OFFRE/DEMANDE PAR GRAINE =====
// supplyPressure[seedId] = valeur entre -1.0 et +0.30
//   négatif  → surplus de ventes → prix baisse (peut aller à -1.0 = -100%)
//   positif  → rareté (peu de ventes) → prix monte (max +0.30 = +30%)
const supplyPressure = {};
SEEDS.forEach(s => { supplyPressure[s.id] = 0; }); // 0 = neutre au démarrage

let globalEvent  = null;
let globalCrash  = false;
let serverTick   = 0;

// Sessions actives {socketId: {playerId, username, socketId}}
const sessions = {};

// Tokens de reconnexion automatique {token: {playerId, username, expiresAt}}
const reconnectTokens = {};

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Couleurs de pseudo par joueur {username: color}
const playerColors = {};

// Cache états joueurs {playerId: playerState}
const playerStates = {};

// Chat global history (last 100 messages)
const globalChatHistory = [];

// Chat privé {key: [{from,to,text,ts,avatar,nameColor}]}
const privateMessages = {};

// Avatars en mémoire {username: base64DataUrl}
const playerAvatars = {};

// ===== SYSTÈME D'AMIS — PERSISTÉ DANS SUPABASE =====
// friendRequests[toUsername] = [{from, createdAt}]  (en mémoire uniquement, volatil mais acceptable)
const friendRequests = {};

// ---- Helpers Supabase pour les amitiés ----
async function areFriends(a, b) {
  const [u1, u2] = [a, b].sort();
  try {
    const rows = await sbFetch(`friendships?user1=eq.${encodeURIComponent(u1)}&user2=eq.${encodeURIComponent(u2)}&select=user1`);
    return rows && rows.length > 0;
  } catch(e) { return false; }
}

async function addFriendship(a, b) {
  const [u1, u2] = [a, b].sort();
  try {
    const res = await sbFetch('friendships', 'POST', { user1: u1, user2: u2 });
    console.log('[AMIS] addFriendship ' + u1 + ' <-> ' + u2 + ' :', JSON.stringify(res));
  } catch(e) { console.error('addFriendship error:', e); }
}

async function removeFriendship(a, b) {
  const [u1, u2] = [a, b].sort();
  try {
    await sbFetch(`friendships?user1=eq.${encodeURIComponent(u1)}&user2=eq.${encodeURIComponent(u2)}`, 'DELETE');
  } catch(e) { console.error('removeFriendship error:', e); }
}

async function getFriendsOf(username) {
  try {
    const enc = encodeURIComponent(username);
    const [asU1, asU2] = await Promise.all([
      sbFetch('friendships?user1=eq.' + enc + '&select=user2'),
      sbFetch('friendships?user2=eq.' + enc + '&select=user1')
    ]);
    const friends = [];
    if (asU1) asU1.forEach(r => friends.push(r.user2));
    if (asU2) asU2.forEach(r => friends.push(r.user1));
    console.log('[AMIS] getFriendsOf', username, '->', friends);
    return friends;
  } catch(e) {
    console.error('[AMIS] getFriendsOf error:', e);
    return [];
  }
}

function getPendingRequestsFor(username) {
  return (friendRequests[username] || []);
}

// Find socket of a player by username
function getSocketByUsername(username) {
  return Object.values(sessions).find(s => s.username === username);
}

// ===== UTILITAIRES =====
function f4(n) { return parseFloat(parseFloat(n).toFixed(4)); }

function hashPass(p) {
  let h = 0;
  for (let i = 0; i < p.length; i++) { h = ((h << 5) - h) + p.charCodeAt(i); h |= 0; }
  return 'tc_' + Math.abs(h).toString(36) + '_' + p.length;
}

function seedCost(s) {
  const imp = s.reg !== 'Europe' && s.reg !== 'Init' ? s.pr * IMPORT_RATE : 0;
  return { base: s.pr, imp, total: s.pr + imp };
}

function newPlayerState() {
  const plots = [];
  plots.push({id:0, st:'init', crop:null, planted:null});
  for (let i = 1; i < 10; i++) plots.push({id:i, st:'locked', crop:null, planted:null});
  return {
    wallet: 0.05, earned: 0, fees: 0, spent: 0,
    inv: {pest:0},
    boosts: {speed:0, yield:0, pest:0},
    plotBoosts: {},
    plots,
    harvested: {},
    seedsInv: {},
    logs: [],
    transactions: [],
    initDone: false,
    plantsCount: {},
    unlockedMutations: [],
    createdAt: Date.now()
  };
}

function logState(state, txt, cls) {
  const now = new Date();
  const t = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(x => String(x).padStart(2,'0')).join(':');
  state.logs.unshift({t, txt, cls: cls || ''});
  if (state.logs.length > 120) state.logs.pop();
}

function logTxState(state, type, desc, amt) {
  const now = new Date();
  const t = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(x => String(x).padStart(2,'0')).join(':');
  state.transactions.unshift({t, type, desc, amt});
  if (state.transactions.length > 100) state.transactions.pop();
}

// ===== SAVE/LOAD SUPABASE =====
async function loadPlayerState(playerId) {
  if (!playerId) return null;
  if (playerStates[playerId]) return playerStates[playerId];
  try {
    const rows = await sbFetch(`saves?player_id=eq.${encodeURIComponent(playerId)}&select=save_data`);
    if (rows && rows.length && rows[0].save_data) {
      const state = rows[0].save_data;
      // Sanity-check required fields
      if (!Array.isArray(state.plots)) state.plots = [];
      if (!state.inv) state.inv = { pest: 0 };
      if (!state.boosts) state.boosts = { speed: 0, yield: 0, pest: 0 };
      if (!state.plotBoosts) state.plotBoosts = {};
      if (!state.harvested) state.harvested = {};
      if (!state.seedsInv) state.seedsInv = {};
      if (!state.logs) state.logs = [];
      if (!state.transactions) state.transactions = [];
      if (!state.plantsCount) state.plantsCount = {};
      if (!state.unlockedMutations) state.unlockedMutations = [];
      if (!state.exclusiveSeeds) state.exclusiveSeeds = [];
      playerStates[playerId] = state;
      return state;
    }
  } catch(e) { console.error('loadPlayerState error:', e); }
  return null;
}

async function persistPlayerState(playerId, username, state) {
  if (!playerId || !state) return;
  // S'assurer que tous les champs critiques sont présents
  if (!state.plantsCount)       state.plantsCount = {};
  if (!state.unlockedMutations) state.unlockedMutations = [];
  if (!state.exclusiveSeeds)    state.exclusiveSeeds = [];
  if (!state.harvested)         state.harvested = {};
  if (!state.seedsInv)          state.seedsInv = {};

  const plotsOwned = Array.isArray(state.plots) ? state.plots.filter(p => p.st !== 'locked').length : 0;
  const payload = {
    player_id:    playerId,
    username,
    save_data:    state,
    wallet:       f4(state.wallet || 0),
    plots_owned:  plotsOwned,
    total_earned: f4(state.earned || 0),
    updated_at:   new Date().toISOString()
  };
  try {
    const existing = await sbFetch(`saves?player_id=eq.${encodeURIComponent(playerId)}&select=player_id`);
    if (existing && existing.length) {
      await sbFetch(`saves?player_id=eq.${encodeURIComponent(playerId)}`, 'PATCH', payload);
    } else {
      await sbFetch('saves', 'POST', payload);
    }
  } catch(e) { console.error('persistPlayerState error:', e); }
}

// ===== MARCHÉ GLOBAL — FLUCTUATION =====
function fluctuateMarket() {
  SEEDS.forEach(s => {
    // Le safran a une volatilité spéciale — très capricieux sur le marché
    const isSaffron = s.id === 'saffron';
    const baseDrift = isSaffron ? 0.45 : 0.16; // safran: drift 3× plus fort
    const drift = (Math.random() - 0.52) * baseDrift;
    const cur   = globalMarket[s.id] || s.bv;
    const costTotal = s.reg !== 'Europe' ? s.pr * 1.25 : s.pr;

    const evActive  = globalEvent && (globalEvent.crops === null || globalEvent.crops.includes(s.id));
    const evMult    = evActive ? globalEvent.m : 1;

    // Saison : hors-saison = plafond plus haut + plancher plus haut
    const inSeason = currentSeason.seeds.includes(s.id);
    const seasonBonus = inSeason ? 1.0 : (1 + currentSeason.offSeasonBonus);
    const seasonFloorMult = inSeason ? 0.001 : (0.30 + currentSeason.offSeasonBonus * 0.3); // hors-saison ne peut pas trop chuter

    const ceiling = isSaffron
      ? costTotal * 2.50 * Math.max(evMult, 1)
      : costTotal * 1.30 * seasonBonus * Math.max(evMult, 1);
    const floor = costTotal * seasonFloorMult;

    let next = cur * (1 + drift);
    // Le safran revient moins vite vers sa valeur de base (plus erratique)
    const meanReversion = isSaffron ? 0.01 : 0.04;
    // Cible de mean-reversion : bv normal en saison, bv*bonus hors-saison
    const bvTarget = inSeason ? s.bv : s.bv * (1 + currentSeason.offSeasonBonus * 0.7);
    next = next + (bvTarget - next) * meanReversion;

    if (evActive) {
      const target = (s.bv * evMult);
      next = next + (target - next) * 0.25;
    }

    // ── Pression offre/demande joueurs ──
    const sp = supplyPressure[s.id] || 0;

    if (sp < 0.30) {
      supplyPressure[s.id] = Math.min(0.30, sp + 0.002);
    }

    const pressureEffect = (supplyPressure[s.id] || 0) * 0.14;
    next = next * (1 + pressureEffect);

    // Décroissance naturelle vers 0 si surplus (côté négatif seulement)
    if (supplyPressure[s.id] < 0) {
      supplyPressure[s.id] *= 0.92; // récupère de -8% par tick
      if (supplyPressure[s.id] > -0.005) supplyPressure[s.id] = 0;
    }

    globalMarket[s.id] = Math.min(ceiling, Math.max(floor, next));
  });
}

// ===== CHOC IMMÉDIAT DU MARCHÉ =====
function applyEventShock(ev) {
  SEEDS.forEach(s => {
    const affected = ev.crops === null || ev.crops.includes(s.id);
    if (!affected) return;
    const costTotal = s.reg !== 'Europe' ? s.pr * 1.25 : s.pr;
    const ceiling = costTotal * 1.30 * Math.max(ev.m, 1);
    const floor = costTotal * 0.001;
    const cur       = globalMarket[s.id] || s.bv;
    const target    = s.bv * ev.m;
    const shocked   = cur + (target - cur) * 0.60;
    globalMarket[s.id] = Math.min(ceiling, Math.max(floor, shocked));
  });
  io.emit('market_update', { market: globalMarket, event: globalEvent, crash: globalCrash, supplyPressure, season: currentSeason, seasonIdx: currentSeasonIdx, seasonStartTime, seasonDuration: getCurrentMonthDurationMs() });
}

// ===== ÉVÉNEMENTS GLOBAUX =====
function maybeGlobalEvent() {
  if (globalEvent) return;
  const roll = Math.random();
  if (roll < 0.05) {
    const crashEvs = EVENTS.filter(e => e.crash);
    globalEvent = crashEvs[Math.floor(Math.random() * crashEvs.length)];
    globalCrash = true;
    io.emit('global_event', { event: globalEvent, crash: true });
    console.log('🚨 CRASH:', globalEvent.txt);
    applyEventShock(globalEvent);
    setTimeout(() => {
      globalEvent = null; globalCrash = false;
      io.emit('global_event', { event: null, crash: false });
    }, 60000);
  } else if (roll < 0.15) {
    const normalEvs = EVENTS.filter(e => !e.crash);
    globalEvent = normalEvs[Math.floor(Math.random() * normalEvs.length)];
    globalCrash = false;
    io.emit('global_event', { event: globalEvent, crash: false });
    console.log('📢 Événement:', globalEvent.txt);
    applyEventShock(globalEvent);
    setTimeout(() => {
      globalEvent = null;
      io.emit('global_event', { event: null, crash: false });
    }, 45000);
  }
}

// ===== MISE À JOUR CULTURES =====
function updateAllCrops() {
  const now = Date.now();
  Object.entries(playerStates).forEach(([playerId, state]) => {
    if (!state || !Array.isArray(state.plots)) return;
    let changed = false;
    const cropAlerts = [];

    state.plots.forEach(p => {
      if (!p || !p.planted || p.st === 'locked' || p.st === 'empty' || p.st === 'rotting') return;
      const s = p.crop === 'init' ? INIT_SEED : findAnySeed(p.crop);
      if (!s) return;
      const gMs = p.realGMs || s.gMs;
      const hMs = p.realHMs || s.hMs;
      const el  = now - p.planted;

      if (p.st === 'growing' && el >= gMs) {
        p.st = 'ready';
        changed = true;
        cropAlerts.push({ type: 'ready', msg: s.nm + ' prête à récolter !', plot: p.id });
        logState(state, s.nm + ' prête — parcelle ' + (p.id + 1), 'inf');
      } else if (p.st === 'ready' && el >= gMs + hMs) {
        if (p.noRot) {
          // Mutation no_rot : ne pourrit jamais, reste ready indéfiniment
        } else {
          p.st = 'rotting';
          changed = true;
          cropAlerts.push({ type: 'rotting', msg: s.nm + ' a pourri !', plot: p.id });
          logState(state, s.nm + ' a pourri — parcelle ' + (p.id + 1), 'neg');
        }
      }
    });

    if (changed) {
      const sess = Object.values(sessions).find(s => s.playerId === playerId);
      if (sess) {
        io.to(sess.socketId).emit('state_update', { state, alerts: cropAlerts });
      }
    }
  });
}

// ===== BOUCLE SERVEUR =====
setInterval(() => {
  serverTick++;

  updateAllCrops();

  if (serverTick % 10 === 0) {
    fluctuateMarket();
    io.emit('market_update', { market: globalMarket, event: globalEvent, crash: globalCrash, supplyPressure, season: currentSeason, seasonIdx: currentSeasonIdx, seasonStartTime, seasonDuration: getCurrentMonthDurationMs() });
  }

  if (serverTick % 30 === 0) {
    maybeGlobalEvent();
  }

  if (serverTick % 60 === 0) {
    Object.values(sessions).forEach(sess => {
      const state = playerStates[sess.playerId];
      if (state) persistPlayerState(sess.playerId, sess.username, state);
    });
  }

}, 1000);

// ===== WEBSOCKET HANDLERS =====
io.on('connection', (socket) => {
  console.log('🔌 Connexion:', socket.id);

  // ---------- INSCRIPTION ----------
  socket.on('register', async ({ username, password }) => {
    if (!username || !password || username.length < 2 || password.length < 4) {
      return socket.emit('auth_error', 'Données invalides.');
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(username)) {
      return socket.emit('auth_error', 'Pseudo invalide (lettres, chiffres, _ et - uniquement).');
    }
    try {
      const existing = await sbFetch(`players?username=eq.${encodeURIComponent(username)}&select=id`);
      if (existing && existing.length) return socket.emit('auth_error', 'Ce pseudo est déjà utilisé.');

      const res = await sbFetch('players', 'POST', { username, password_hash: hashPass(password) });
      if (!res || res.error || !res[0]) return socket.emit('auth_error', 'Erreur lors de la création.');

      const player = res[0];
      const state  = newPlayerState();
      playerStates[player.id] = state;
      sessions[socket.id] = { playerId: player.id, username, socketId: socket.id };
      await persistPlayerState(player.id, username, state);

      const token = generateToken();
      reconnectTokens[token] = { playerId: player.id, username, expiresAt: Date.now() + 7 * 24 * 3600000 };

      socket.emit('auth_ok', {
        username, playerId: player.id,
        state, market: globalMarket, season: currentSeason, seasonIdx: currentSeasonIdx, seasonStartTime, seasonDuration: getCurrentMonthDurationMs(),
        event: globalEvent, crash: globalCrash,
        friends: [],
        pendingRequests: [],
        sessionToken: token,
        chatHistory: globalChatHistory.slice(-60),
        supplyPressure
      });
      console.log('✅ Nouveau joueur:', username);
    } catch(e) {
      socket.emit('auth_error', 'Erreur serveur.');
    }
  });

  // ---------- CONNEXION ----------
  socket.on('login', async ({ username, password }) => {
    try {
      const rows = await sbFetch(`players?username=eq.${encodeURIComponent(username)}&select=id,password_hash`);
      if (!rows || !rows.length) return socket.emit('auth_error', 'Compte introuvable.');
      const player = rows[0];
      if (player.password_hash !== hashPass(password)) return socket.emit('auth_error', 'Mot de passe incorrect.');

      let state = await loadPlayerState(player.id);
      if (!state) {
        state = newPlayerState();
        playerStates[player.id] = state;
      }

      sessions[socket.id] = { playerId: player.id, username, socketId: socket.id };

      // Build friend list with stats
      const friendNames = await getFriendsOf(username);
      const friendsData = await buildFriendsData(friendNames);

      const token = generateToken();
      reconnectTokens[token] = { playerId: player.id, username, expiresAt: Date.now() + 7 * 24 * 3600000 };

      socket.emit('auth_ok', {
        username, playerId: player.id,
        state, market: globalMarket, season: currentSeason, seasonIdx: currentSeasonIdx, seasonStartTime, seasonDuration: getCurrentMonthDurationMs(),
        event: globalEvent, crash: globalCrash,
        friends: friendsData,
        pendingRequests: getPendingRequestsFor(username),
        sessionToken: token,
        chatHistory: globalChatHistory.slice(-60),
        avatar: playerAvatars[username] || null,
        onlinePlayers: Object.values(sessions).map(s => s.username),
        supplyPressure
      });
      // Broadcast updated player list
      io.emit('players_online', { count: Object.keys(sessions).length, usernames: Object.values(sessions).map(s => s.username) });
      console.log('🔑 Connexion:', username);
    } catch(e) {
      socket.emit('auth_error', 'Erreur serveur.');
    }
  });

  // ---------- PROFIL PUBLIC ----------
  socket.on('get_player_profile', async ({ username }) => {
    try {
      const rows = await sbFetch(`saves?username=eq.${encodeURIComponent(username)}&select=username,wallet,plots_owned,total_earned,updated_at,save_data`);
      if (!rows || !rows.length) {
        return socket.emit('player_profile', { username, notFound: true });
      }
      const r = rows[0];
      const saveData = r.save_data || {};
      const totalHarvests = saveData.transactions
        ? saveData.transactions.filter(t => t.type === 'harvest').length
        : 0;
      socket.emit('player_profile', {
        username: r.username,
        wallet:   r.wallet || 0,
        earned:   r.total_earned || 0,
        plots:    r.plots_owned || 0,
        harvests: totalHarvests,
        created_at: saveData.createdAt || null
      });
    } catch(e) {
      socket.emit('player_profile', { username, notFound: true });
    }
  });

  // ---------- DEMANDE D'AMI ----------
  socket.on('friend_request', async ({ to }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const from = sess.username;
    if (from === to) return socket.emit('friend_error', 'Vous ne pouvez pas vous ajouter vous-même.');
    if (await areFriends(from, to)) return socket.emit('friend_error', 'Vous êtes déjà amis.');

    // Check if target exists
    try {
      const rows = await sbFetch(`players?username=eq.${encodeURIComponent(to)}&select=id`);
      if (!rows || !rows.length) return socket.emit('friend_error', 'Joueur introuvable : ' + to);
    } catch(e) {
      return socket.emit('friend_error', 'Erreur serveur.');
    }

    // Check pending requests
    if (!friendRequests[to]) friendRequests[to] = [];
    const already = friendRequests[to].find(r => r.from === from);
    if (already) return socket.emit('friend_error', 'Demande déjà envoyée à ' + to + '.');

    // If 'to' already sent a request to 'from', auto-accept
    const reverseIdx = (friendRequests[from] || []).findIndex(r => r.from === to);
    if (reverseIdx >= 0) {
      // Auto accept
      friendRequests[from].splice(reverseIdx, 1);
      await addFriendship(from, to);

      // Délai Supabase
      await new Promise(r => setTimeout(r, 300));

      // Notify both players
      const toSock   = getSocketByUsername(to);
      const fromSock = getSocketByUsername(from);

      const [fromFriends, toFriends] = await Promise.all([
        buildFriendsData(await getFriendsOf(from)),
        buildFriendsData(await getFriendsOf(to))
      ]);

      if (fromSock) {
        io.to(fromSock.socketId).emit('friends_update', { friends: fromFriends, pendingRequests: getPendingRequestsFor(from) });
        io.to(fromSock.socketId).emit('friend_accepted', { username: to });
      }
      if (toSock) {
        io.to(toSock.socketId).emit('friends_update', { friends: toFriends, pendingRequests: getPendingRequestsFor(to) });
        io.to(toSock.socketId).emit('friend_accepted', { username: from });
      }
      return;
    }

    // Add pending request
    friendRequests[to].push({ from, createdAt: Date.now() });

    // Notify sender
    socket.emit('friend_request_sent', { to });

    // Notify recipient if online
    const toSock = getSocketByUsername(to);
    if (toSock) {
      io.to(toSock.socketId).emit('friend_request_received', {
        from,
        pendingRequests: getPendingRequestsFor(to)
      });
    }
    console.log(`👥 Demande d'ami : ${from} → ${to}`);
  });

  // ---------- ACCEPTER DEMANDE D'AMI ----------
  socket.on('friend_accept', async ({ from }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const to = sess.username;

    const idx = (friendRequests[to] || []).findIndex(r => r.from === from);

    // Fallback si la demande n'est plus en mémoire (ex: redémarrage serveur)
    // On vérifie que les deux joueurs existent et ne sont pas déjà amis
    if (idx < 0) {
      const alreadyFriends = await areFriends(from, to);
      if (alreadyFriends) return socket.emit('friend_error', 'Vous êtes déjà amis.');
      // Accepter quand même — la demande venait probablement d'avant un redémarrage
      console.log(`⚠ friend_accept sans demande en mémoire : ${from} → ${to}, acceptation directe`);
    } else {
      friendRequests[to].splice(idx, 1);
    }

    await addFriendship(from, to);

    // Délai pour laisser Supabase propager l'insertion
    await new Promise(r => setTimeout(r, 800));

    // Vérifier que l'amitié est bien enregistrée
    const check = await areFriends(from, to);
    console.log('[AMIS] Vérification post-insert ' + from + '<->' + to + ':', check);

    // Notify both players avec listes fraîches
    const toSock   = getSocketByUsername(to);
    const fromSock = getSocketByUsername(from);

    const [toFriends, fromFriends] = await Promise.all([
      buildFriendsData(await getFriendsOf(to)),
      buildFriendsData(await getFriendsOf(from))
    ]);

    console.log('[AMIS] toFriends:', toFriends.map(f=>f.username), 'fromFriends:', fromFriends.map(f=>f.username));

    if (toSock) {
      io.to(toSock.socketId).emit('friends_update', { friends: toFriends,   pendingRequests: getPendingRequestsFor(to) });
      io.to(toSock.socketId).emit('friend_accepted', { username: from });
    }
    if (fromSock) {
      io.to(fromSock.socketId).emit('friends_update', { friends: fromFriends, pendingRequests: getPendingRequestsFor(from) });
      io.to(fromSock.socketId).emit('friend_accepted', { username: to });
    }
    console.log('✅ Amitié : ' + from + ' <-> ' + to);
  });

  // ---------- REFUSER DEMANDE D'AMI ----------
  socket.on('friend_decline', async ({ from }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const to = sess.username;

    if (friendRequests[to]) {
      friendRequests[to] = friendRequests[to].filter(r => r.from !== from);
    }
    try {
      const names = await getFriendsOf(to);
      const friends = await buildFriendsData(names);
      socket.emit('friends_update', { friends, pendingRequests: getPendingRequestsFor(to) });
    } catch(e) {
      socket.emit('friends_update', { friends: [], pendingRequests: getPendingRequestsFor(to) });
    }
    console.log(`❌ Demande refusée : ${from} → ${to}`);
  });

  // ---------- SUPPRIMER AMI ----------
  socket.on('friend_remove', async ({ username: targetUser }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const me = sess.username;
    await removeFriendship(me, targetUser);

    // Notify self
    const friends = await buildFriendsData(await getFriendsOf(me));
    socket.emit('friends_update', { friends, pendingRequests: getPendingRequestsFor(me) });

    // Notify other if online
    const targetSock = getSocketByUsername(targetUser);
    if (targetSock) {
      const theirFriends = await buildFriendsData(await getFriendsOf(targetUser));
      io.to(targetSock.socketId).emit('friends_update', { friends: theirFriends, pendingRequests: getPendingRequestsFor(targetUser) });
    }
    console.log(`🗑 Amitié supprimée : ${me} ↔ ${targetUser}`);
  });

  // ---------- OBTENIR LISTE AMIS ----------
  socket.on('get_friends', async () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const me = sess.username;
    const friends = await buildFriendsData(await getFriendsOf(me));
    socket.emit('friends_update', { friends, pendingRequests: getPendingRequestsFor(me) });
  });

  // ---------- PLANTER ----------
  // ================================================================
  //  ACHAT DE GRAINES (inventaire — planter plus tard)
  // ================================================================
  socket.on('buy_seed', ({ seedId, qty }) => {
    const sess  = sessions[socket.id];
    if (!sess) return socket.emit('game_error', 'Non authentifié.');
    const state = playerStates[sess.playerId];
    if (!state) return;

    qty = Math.max(1, Math.min(99, parseInt(qty) || 1));
    const s = SEEDS.find(x => x.id === seedId);
    if (!s) return socket.emit('game_error', 'Graine invalide.');

    const c = seedCost(s);
    const total = f4(c.total * qty);
    if (state.wallet < total) return socket.emit('game_error', 'Solde insuffisant (besoin de ' + total + ' USDC).');

    state.wallet = f4(state.wallet - total);
    state.spent  = f4((state.spent || 0) + total);
    if (!state.seedsInv) state.seedsInv = {};
    state.seedsInv[seedId] = (state.seedsInv[seedId] || 0) + qty;

    logState(state, 'Achat ' + qty + '× ' + s.ico + ' ' + s.nm + ' → inventaire (−' + f4(total) + ' USDC)', 'neg');
    logTxState(state, 'buy_seed', qty + '× ' + s.ico + ' ' + s.nm, -total);
    persistPlayerState(sess.playerId, sess.username, state);
    socket.emit('state_update', { state });
    toast_broadcast && toast_broadcast(null); // no broadcast needed
  });

  socket.on('plant', ({ plotId, seedId }) => {
    const sess  = sessions[socket.id];
    if (!sess) return socket.emit('game_error', 'Non authentifié.');
    const state = playerStates[sess.playerId];
    if (!state) return;

    const p = state.plots.find(x => x.id === plotId);
    if (!p || (p.st !== 'empty' && p.st !== 'init')) return socket.emit('game_error', 'Parcelle invalide.');

    if (p.st === 'init') {
      p.st = 'growing'; p.crop = 'init'; p.planted = Date.now();
      p.realGMs = INIT_SEED.gMs; p.realHMs = INIT_SEED.hMs;
      logState(state, 'Graine spéciale plantée — initiation en cours', 'inf');
      socket.emit('state_update', { state });
      return;
    }

    const s = SEEDS.find(x => x.id === seedId)
           || AUCTION_EXCLUSIVE_SEEDS.find(x => x.id === seedId)
           || MUTATION_SEEDS.find(x => x.id === seedId);
    if (!s) return socket.emit('game_error', 'Graine invalide.');

    // Graines exclusives et mutations : depuis harvested
    const isExclusive = !!AUCTION_EXCLUSIVE_SEEDS.find(x => x.id === seedId);
    const isMutation  = !!MUTATION_SEEDS.find(x => x.id === seedId);

    if (isMutation || isExclusive) {
      // Vérifier inventaire harvested
      if (!state.harvested[seedId] || state.harvested[seedId].qty < 1)
        return socket.emit('game_error', 'Vous ne possédez pas cette graine.');
      state.harvested[seedId].qty--;
      if (state.harvested[seedId].qty <= 0) delete state.harvested[seedId];
    } else {
      // Graines normales : vérifier seedsInv d'abord
      if (!state.seedsInv) state.seedsInv = {};
      const inStock = (state.seedsInv[seedId] || 0);
      if (inStock < 1)
        return socket.emit('game_error', 'Vous ne possédez pas cette graine. Achetez-la d\'abord dans Boutique → Graines.');
      state.seedsInv[seedId]--;
      if (state.seedsInv[seedId] <= 0) delete state.seedsInv[seedId];
    }
    const isFree = true; // toujours depuis inventaire maintenant

    const pb = state.plotBoosts[plotId] || {};
    const speedBoost = (pb.speed || 0) > 0;
    const yieldBoost = (pb.yield || 0) > 0;
    const pestBoost  = (pb.pest  || 0) > 0;
    if (state.plotBoosts[plotId]) state.plotBoosts[plotId] = {speed:0, yield:0, pest:0};

    // Effets des mutations sur temps de pousse
    let gMsBase = s.gMs, hMsBase = s.hMs;
    if (!state.unlockedMutations) state.unlockedMutations = {};
    const MUTATIONS_SRV = [
      {id:'mut_goldwheat',    baseSeed:'wheat',      reqPlants:10, effect:'yield_bonus',  val:0.5},
      {id:'mut_supertom',     baseSeed:'tomato',     reqPlants:15, effect:'speed_bonus',  val:0.25},
      {id:'mut_crystalgrape', baseSeed:'grape',      reqPlants:20, effect:'event_bonus',  val:2},
      {id:'mut_goldenolive',  baseSeed:'olive',      reqPlants:5,  effect:'base_bonus',   val:0.5},
      {id:'mut_silvertruffle',baseSeed:'truffle',    reqPlants:3,  effect:'no_rot',       val:1},
      {id:'mut_royalsaffron', baseSeed:'saffron',    reqPlants:2,  effect:'min_price',    val:1.8},
      {id:'mut_firepep',      baseSeed:'pepper',     reqPlants:8,  effect:'price_bonus',  val:0.4},
      {id:'mut_neonrice',     baseSeed:'rice',       reqPlants:25, effect:'min_price',    val:1},
      {id:'mut_rainforest',   baseSeed:'coffee',     reqPlants:6,  effect:'window_bonus', val:2},
      {id:'mut_goldtea',      baseSeed:'tea',        reqPlants:12, effect:'price_bonus',  val:0.6},
      {id:'mut_dragonfire',   baseSeed:'dragon',     reqPlants:8,  effect:'crash_immune', val:1},
      {id:'mut_goldenspice',  baseSeed:'cardamom',   reqPlants:4,  effect:'cost_reduce',  val:0.4},
      {id:'mut_pearlavoc',    baseSeed:'avocado',    reqPlants:10, effect:'cost_reduce',  val:0.3},
      {id:'mut_stonecorn',    baseSeed:'corn',       reqPlants:18, effect:'no_rot',       val:1},
      {id:'mut_darkcacao',    baseSeed:'cacao',      reqPlants:5,  effect:'base_bonus',   val:0.6},
      {id:'mut_sacredvanilla',baseSeed:'vanilla',    reqPlants:3,  effect:'yield_bonus',  val:1.0},
      {id:'mut_desertargan',  baseSeed:'argan',      reqPlants:4,  effect:'crash_immune', val:1},
      {id:'mut_ancientbaobab',baseSeed:'baobab',     reqPlants:3,  effect:'window_bonus', val:3},
      {id:'mut_goldenMac',    baseSeed:'macadamia',  reqPlants:5,  effect:'price_bonus',  val:0.7},
      {id:'mut_dreamdavidson',baseSeed:'davidson',   reqPlants:4,  effect:'speed_bonus',  val:0.3},
    ];

    // Vérifier et débloquer mutation + donner graine de mutation si seuil atteint
    if (!state.plantsCount) state.plantsCount = {};
    if (!isMutation && !isExclusive) {
      state.plantsCount[seedId] = (state.plantsCount[seedId] || 0) + 1;
      if (!Array.isArray(state.unlockedMutations)) state.unlockedMutations = [];
      const mut = MUTATIONS_SRV.find(m => m.baseSeed === seedId);
      if (mut && state.plantsCount[seedId] >= mut.reqPlants) {
        const alreadyUnlocked = state.unlockedMutations.includes(mut.id);
        if (!alreadyUnlocked) {
          state.unlockedMutations.push(mut.id);
          // Donner une graine de mutation plantable/vendable
          if (!state.harvested[mut.id]) state.harvested[mut.id] = {qty: 0};
          state.harvested[mut.id].qty++;
          logState(state, `🧬 Mutation débloquée : ${MUTATION_SEEDS.find(ms=>ms.id===mut.id)?.ico||'🧬'} ${MUTATION_SEEDS.find(ms=>ms.id===mut.id)?.nm||mut.id} — graine en inventaire !`, 'ok');
          const sk = getSocketByUsername(sess.username);
          if (sk) io.to(sk.socketId).emit('mutation_unlocked', { mutationId: mut.id, seedName: MUTATION_SEEDS.find(ms=>ms.id===mut.id)?.nm || mut.id });
        } else {
          // Déjà débloquée : donner une graine supplémentaire toutes les 5 plantations après
          const extra = state.plantsCount[seedId] - mut.reqPlants;
          if (extra > 0 && extra % 5 === 0) {
            if (!state.harvested[mut.id]) state.harvested[mut.id] = {qty: 0};
            state.harvested[mut.id].qty++;
            logState(state, `🧬 +1 graine ${MUTATION_SEEDS.find(ms=>ms.id===mut.id)?.ico||'🧬'} ${MUTATION_SEEDS.find(ms=>ms.id===mut.id)?.nm||mut.id}`, 'ok');
          }
        }
      }
    }

    // Appliquer effet speed_bonus de la mutation correspondante (si active)
    const activeMut = MUTATIONS_SRV.find(m => m.baseSeed === seedId && Array.isArray(state.unlockedMutations) && state.unlockedMutations.includes(m.id));
    if (activeMut && activeMut.effect === 'speed_bonus') gMsBase = Math.round(gMsBase * (1 - activeMut.val));
    if (activeMut && activeMut.effect === 'window_bonus') hMsBase = Math.round(hMsBase * activeMut.val);

    const realGMs = speedBoost ? Math.round(gMsBase * (1 - BOOSTS.find(b => b.id==='water_prem').val)) : gMsBase;
    const realHMs = pestBoost  ? hMsBase * 2 : hMsBase;

    p.st = 'growing'; p.crop = seedId; p.planted = Date.now();
    p.realGMs = realGMs; p.realHMs = realHMs; p.yieldBoost = yieldBoost;
    // Stocker le flag no_rot et crash_immune sur la parcelle
    if (activeMut && activeMut.effect === 'no_rot')       p.noRot = true;
    else p.noRot = false;
    if (activeMut && activeMut.effect === 'crash_immune') p.crashImmune = true;
    else p.crashImmune = false;

    logState(state, 'Plantation ' + s.nm + (isFree ? ' (inventaire)' : ' — −' + f4(seedCost(s).total) + ' USDC'), isFree ? 'inf' : 'neg');
    if (!isFree) logTxState(state, 'plant', s.ico + ' ' + s.nm + ' (Parcelle ' + (plotId+1) + ')', -seedCost(s).total);

    // XP + missions
    if (global._grantXP) { const r = global._grantXP(state, 2, 'plant'); if (r && r.levelUp) socket.emit('level_up', r); }
    if (global._trackMission) global._trackMission(sessions[socket.id], state, 'plant', s.id, 1);
    persistPlayerState(sess.playerId, sess.username, state);
    socket.emit('state_update', { state });
  });

  // ---------- RÉCOLTER ----------
  socket.on('harvest', ({ plotId }) => {
    const sess  = sessions[socket.id];
    if (!sess) return;
    const state = playerStates[sess.playerId];
    if (!state) return;

    const p = state.plots.find(x => x.id === plotId);
    if (!p || (p.st !== 'ready' && p.st !== 'init')) return;

    if (p.crop === 'init') {
      p.st = 'empty'; p.crop = null; p.planted = null;
      state.initDone = true;
      logState(state, 'Initiation terminée — mode réel activé', 'inf');
      socket.emit('state_update', { state });
      return;
    }

    const s  = findAnySeed(p.crop);
    if (!s) return;

    if (!state.harvested[s.id]) state.harvested[s.id] = {qty:0, yieldBoost:false};

    // Yield bonus de mutation (ex: Blé Doré +50%, Vanille Sacrée ×2)
    let yieldQty = 1;
    if (p.yieldBoost) {
      state.harvested[s.id].yieldBoost = true;
      yieldQty = 1; // le bonus yield est appliqué à la vente
    }
    // Mutation yield_bonus : donne une quantité supplémentaire à la récolte
    if (Array.isArray(state.unlockedMutations)) {
      const YIELD_MUTS = {
        'mut_goldwheat':    {baseSeed:'wheat',   val:0.5},
        'mut_sacredvanilla':{baseSeed:'vanilla',  val:1.0},
      };
      Object.entries(YIELD_MUTS).forEach(([mutId, m]) => {
        if (p.crop === m.baseSeed && state.unlockedMutations.includes(mutId)) {
          yieldQty += m.val; // 0.5 → 50% chance d'un +1, ou on arrondit
        }
      });
    }
    state.harvested[s.id].qty += Math.round(yieldQty);

    const mp  = globalMarket[s.id] || s.bv;
    const ev  = globalEvent && (globalEvent.crops === null || globalEvent.crops.includes(s.id));
    const cur = ev ? mp * globalEvent.m : mp;
    logState(state, 'Récolte ' + s.nm + ' — en inventaire. Prix actuel : ' + f4(cur) + ' USDC', 'inf');
    logTxState(state, 'harvest', s.ico + ' ' + s.nm + ' (Parcelle ' + (plotId+1) + ')', 0);

    p.st = 'empty'; p.crop = null; p.planted = null; p.realGMs = null; p.realHMs = null; p.yieldBoost = false; p.noRot = false; p.crashImmune = false;
    // XP + missions
    if (global._grantXP) { const r = global._grantXP(state, 5, 'harvest'); if (r && r.levelUp) socket.emit('level_up', r); }
    if (global._trackMission) global._trackMission(sessions[socket.id], state, 'harvest', s.id, 1);
    persistPlayerState(sess.playerId, sess.username, state);
    socket.emit('state_update', { state });
  });

  // ---------- VENDRE ----------
  socket.on('sell', ({ seedId }) => {
    const sess  = sessions[socket.id];
    if (!sess) return;
    const state = playerStates[sess.playerId];
    if (!state) return;

    const inv = state.harvested[seedId];
    const qty = inv ? (inv.qty || 0) : 0;
    if (!qty) return socket.emit('game_error', 'Rien à vendre.');

    const s = findAnySeed(seedId);
    if (!s) return socket.emit('game_error', 'Graine introuvable.');

    // Prix de base : market pour graines normales, bv fixe pour exclusives/mutations
    const isNormalSeed = !!SEEDS.find(x => x.id === seedId);
    let mp = isNormalSeed ? (globalMarket[s.id] || s.bv) : s.bv;

    // Appliquer effets mutations sur le prix
    const PRICE_MUTS = {
      'mut_firepep':      {baseSeed:'pepper',    effect:'price_bonus',  val:0.4},
      'mut_goldtea':      {baseSeed:'tea',        effect:'price_bonus',  val:0.6},
      'mut_goldenMac':    {baseSeed:'macadamia',  effect:'price_bonus',  val:0.7},
      'mut_goldenolive':  {baseSeed:'olive',      effect:'base_bonus',   val:0.5},
      'mut_darkcacao':    {baseSeed:'cacao',      effect:'base_bonus',   val:0.6},
      'mut_crystalgrape': {baseSeed:'grape',      effect:'event_bonus',  val:2},
      'mut_royalsaffron': {baseSeed:'saffron',    effect:'min_price',    val:1.8},
      'mut_neonrice':     {baseSeed:'rice',       effect:'min_price',    val:1},
    };
    if (Array.isArray(state.unlockedMutations)) {
      Object.entries(PRICE_MUTS).forEach(([mutId, m]) => {
        if (s.id === m.baseSeed && state.unlockedMutations.includes(mutId)) {
          if (m.effect === 'price_bonus' || m.effect === 'base_bonus') mp = mp * (1 + m.val);
          if (m.effect === 'event_bonus' && globalEvent && (globalEvent.crops === null || globalEvent.crops.includes(s.id))) mp = mp * m.val;
          if (m.effect === 'min_price') mp = Math.max(mp, s.bv * m.val);
        }
      });
    }

    // Crash immunity pour certaines mutations
    const ev  = globalEvent && (globalEvent.crops === null || globalEvent.crops.includes(s.id));
    const isCrashImmune = Array.isArray(state.unlockedMutations) && (
      (s.id === 'dragon' && state.unlockedMutations.includes('mut_dragonfire')) ||
      (s.id === 'argan'  && state.unlockedMutations.includes('mut_desertargan'))
    );
    const eff = (ev && !isCrashImmune) ? mp * globalEvent.m : mp;

    const yb  = inv.yieldBoost || false;
    const fertBoost = BOOSTS.find(b => b.id === 'fert_boost');
    const effWithBoost = (yb && fertBoost) ? eff * (1 + fertBoost.val) : eff;
    const gross = effWithBoost * qty;
    const fee   = gross * COM;
    const net   = gross - fee;

    state.wallet = f4(state.wallet + net);
    state.earned = f4(state.earned + net);
    state.fees   = f4((state.fees || 0) + fee);
    delete state.harvested[seedId];

    if (isNormalSeed) {
      const pressureImpact = qty * 0.08;
      supplyPressure[s.id] = Math.max(-1.0, (supplyPressure[s.id] || 0) - pressureImpact);
      const shockPct = Math.min(0.15, qty * 0.04);
      const cur = globalMarket[s.id] || s.bv;
      const costTotal = s.reg !== 'Europe' ? s.pr * 1.25 : s.pr;
      const hardFloor  = costTotal * 0.001;
      globalMarket[s.id] = Math.max(hardFloor, cur * (1 - shockPct));
    }

    logState(state, 'Vente ' + qty + '× ' + s.nm + ' — +' + f4(net) + ' USDC (comm. −' + f4(fee) + ')', net > 0 ? 'pos' : 'neg');
    logTxState(state, 'sell', qty + '× ' + s.ico + ' ' + s.nm, net);

    // Track market war revenue
    if(typeof trackMarketWarRevenue === 'function') trackMarketWarRevenue(sess.username, seedId, net);

    // XP + missions
    if (global._grantXP) { const r = global._grantXP(state, Math.ceil(qty * 2), 'sell'); if (r && r.levelUp) socket.emit('level_up', r); }
    if (global._trackMission) {
      for (let i = 0; i < qty; i++) global._trackMission(sessions[socket.id], state, 'sell', s.id, 1);
      global._trackMission(sessions[socket.id], state, 'earn', null, net);
    }
    socket.emit('state_update', { state });
    io.emit('market_update', { market: globalMarket, event: globalEvent, crash: globalCrash, supplyPressure, season: currentSeason, seasonIdx: currentSeasonIdx, seasonStartTime, seasonDuration: getCurrentMonthDurationMs() });
  });

  // ---------- ACHETER PARCELLE ----------
  socket.on('buy_plot', ({ plotId }) => {
    const sess  = sessions[socket.id];
    if (!sess) return;
    const state = playerStates[sess.playerId];
    if (!state) return;

    const pr = plotId < PLOT_PRICES.length ? PLOT_PRICES[plotId] : parseFloat((PLOT_PRICES[9] + (plotId-9)*0.70).toFixed(2));
    if (state.wallet < pr) return socket.emit('game_error', 'Solde insuffisant.');
    const p = state.plots.find(x => x.id === plotId);
    if (!p || p.st !== 'locked') return;

    state.wallet = f4(state.wallet - pr);
    state.spent  = f4((state.spent || 0) + pr);
    p.st = 'empty';
    logState(state, 'Parcelle ' + (plotId+1) + ' achetée — −' + f4(pr) + ' USDC', 'neg');
    logTxState(state, 'unlock', '🏡 Parcelle ' + (plotId+1), -pr);
    socket.emit('state_update', { state });
  });

  // ---------- ACHETER BOOST ----------
  socket.on('buy_boost', ({ boostId }) => {
    const sess  = sessions[socket.id];
    if (!sess) return;
    const state = playerStates[sess.playerId];
    if (!state) return;

    const b = BOOSTS.find(x => x.id === boostId);
    if (!b) return;
    if (state.wallet < b.pr) return socket.emit('game_error', 'Solde insuffisant.');

    state.wallet = f4(state.wallet - b.pr);
    state.spent  = f4((state.spent || 0) + b.pr);
    if (b.effect === 'pest') state.inv.pest += b.qty;
    else if (b.effect === 'speed') state.boosts.speed += b.qty;
    else if (b.effect === 'yield') state.boosts.yield += b.qty;

    logState(state, 'Boost acheté : ' + b.nm + ' — −' + f4(b.pr) + ' USDC', 'neg');
    logTxState(state, 'buy', 'Boost ' + b.nm, -b.pr);
    socket.emit('state_update', { state });
  });

  // ---------- ASSIGNER BOOST ----------
  socket.on('assign_boost', ({ boostId, plotId }) => {
    const sess  = sessions[socket.id];
    if (!sess) return;
    const state = playerStates[sess.playerId];
    if (!state) return;

    const b = BOOSTS.find(x => x.id === boostId);
    if (!b) return;

    // Vérifier que la parcelle a une culture plantée (pas vide, pas verrouillée)
    const targetPlot = state.plots.find(p => p.id === plotId);
    if (!targetPlot || (targetPlot.st !== 'growing' && targetPlot.st !== 'ready')) {
      return socket.emit('game_error', 'Vous devez d\'abord planter une culture sur cette parcelle.');
    }

    // Un seul boost par type par parcelle (usage unique)
    if (!state.plotBoosts[plotId]) state.plotBoosts[plotId] = {speed:0, yield:0, pest:0};
    if ((state.plotBoosts[plotId][b.effect] || 0) >= 1) {
      return socket.emit('game_error', 'Un boost ' + b.nm + ' est déjà actif sur cette parcelle. Les boosts sont à usage unique par culture.');
    }

    const stock = b.effect === 'pest' ? state.inv.pest : (b.effect === 'speed' ? state.boosts.speed : state.boosts.yield);
    if (stock <= 0) return socket.emit('game_error', 'Aucun boost disponible.');

    if (b.effect === 'pest') state.inv.pest--;
    else if (b.effect === 'speed') state.boosts.speed--;
    else if (b.effect === 'yield') state.boosts.yield--;

    // Appliquer immédiatement l'effet sur la culture en cours
    if (targetPlot.st === 'growing') {
      if (b.effect === 'speed') {
        const orig = targetPlot.realGMs || (SEEDS.find(s => s.id === targetPlot.crop) || {gMs:0}).gMs;
        targetPlot.realGMs = Math.round(orig * (1 - b.val));
        const elapsed = Date.now() - targetPlot.planted;
        targetPlot.planted = Date.now() - Math.round(elapsed / (1 - b.val));
      } else if (b.effect === 'pest') {
        const baseSeed = SEEDS.find(s => s.id === targetPlot.crop);
        if (baseSeed) targetPlot.realHMs = (targetPlot.realHMs || baseSeed.hMs) * 2;
      }
    }
    // yield boost : marqué sur plotBoosts, appliqué à la vente
    state.plotBoosts[plotId][b.effect] = 1;

    logState(state, 'Boost ' + b.nm + ' assigné à Parcelle ' + (plotId+1) + ' (usage unique)', 'inf');
    socket.emit('state_update', { state });
  });

  // ---------- VIDER PARCELLE POURRIE ----------
  socket.on('clear_plot', ({ plotId }) => {
    const sess  = sessions[socket.id];
    if (!sess) return;
    const state = playerStates[sess.playerId];
    if (!state) return;

    const p = state.plots.find(x => x.id === plotId);
    if (!p || p.st !== 'rotting') return;
    const s = SEEDS.find(x => x.id === p.crop) || INIT_SEED;
    logState(state, s.nm + ' perdue (pourriture) — parcelle ' + (plotId+1), 'neg');
    p.st = 'empty'; p.crop = null; p.planted = null;
    socket.emit('state_update', { state });
  });

  // ---------- CLASSEMENT ----------
  socket.on('get_leaderboard', async () => {
    try {
      const rows = await sbFetch('saves?select=username,wallet,plots_owned,total_earned,updated_at&order=total_earned.desc&limit=50');
      socket.emit('leaderboard', rows || []);
    } catch(e) {
      socket.emit('leaderboard', []);
    }
  });

  // ---------- RECONNEXION PAR TOKEN ----------
  socket.on('reconnect_token', async ({ token }) => {
    if (!token || !reconnectTokens[token]) return socket.emit('token_invalid');
    const td = reconnectTokens[token];
    if (Date.now() > td.expiresAt) {
      delete reconnectTokens[token];
      return socket.emit('token_invalid');
    }
    // Renouveler le token
    const newToken = generateToken();
    reconnectTokens[newToken] = { playerId: td.playerId, username: td.username, expiresAt: Date.now() + 7 * 24 * 3600000 };
    delete reconnectTokens[token];

    let state = await loadPlayerState(td.playerId);
    if (!state) { state = newPlayerState(); playerStates[td.playerId] = state; }
    sessions[socket.id] = { playerId: td.playerId, username: td.username, socketId: socket.id };
    const friendNames = await getFriendsOf(td.username);
    const friendsData = await buildFriendsData(friendNames);
    socket.emit('auth_ok', {
      username: td.username, playerId: td.playerId,
      state, market: globalMarket, event: globalEvent, crash: globalCrash,
      friends: friendsData, pendingRequests: getPendingRequestsFor(td.username),
      sessionToken: newToken,
      chatHistory: globalChatHistory.slice(-60),
      avatar: playerAvatars[td.username] || null,
      onlinePlayers: Object.values(sessions).map(s => s.username),
      supplyPressure
    });
    // Broadcast updated player list
    io.emit('players_online', { count: Object.keys(sessions).length, usernames: Object.values(sessions).map(s => s.username) });
    console.log('🔄 Reconnexion token:', td.username);
  });


  // ---------- CHANGER PSEUDO ----------
  socket.on('change_username', async ({ newUsername, password }) => {
    const sess = sessions[socket.id];
    if (!sess) return socket.emit('change_username_error', 'Non authentifié.');
    if (!newUsername || !password) return socket.emit('change_username_error', 'Données manquantes.');
    if (!/^[a-zA-Z0-9_\-]+$/.test(newUsername) || newUsername.length < 2 || newUsername.length > 20)
      return socket.emit('change_username_error', 'Pseudo invalide (2-20 caractères, lettres/chiffres/_/-).');
    if (newUsername === sess.username) return socket.emit('change_username_error', "C'est déjà votre pseudo.");
    try {
      const rows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=id,password_hash`);
      if (!rows || !rows.length) return socket.emit('change_username_error', 'Compte introuvable.');
      if (rows[0].password_hash !== hashPass(password)) return socket.emit('change_username_error', 'Mot de passe incorrect.');
      const existing = await sbFetch(`players?username=eq.${encodeURIComponent(newUsername)}&select=id`);
      if (existing && existing.length) return socket.emit('change_username_error', 'Ce pseudo est déjà pris.');
      await sbFetch(`players?id=eq.${rows[0].id}`, 'PATCH', { username: newUsername });
      await sbFetch(`saves?player_id=eq.${sess.playerId}`, 'PATCH', { username: newUsername });
      const oldUsername = sess.username;
      Object.values(coopFarms).forEach(farm => {
        farm.members = farm.members.map(m => m === oldUsername ? newUsername : m);
        if (farm.leader === oldUsername) farm.leader = newUsername;
      });
      if (playerAvatars[oldUsername]) { playerAvatars[newUsername] = playerAvatars[oldUsername]; delete playerAvatars[oldUsername]; }
      if (playerColors[oldUsername])  { playerColors[newUsername]  = playerColors[oldUsername];  delete playerColors[oldUsername]; }
      sess.username = newUsername;
      Object.values(reconnectTokens).forEach(t => { if (t.username === oldUsername) t.username = newUsername; });
      socket.emit('change_username_ok', { newUsername });
      io.emit('players_online', { count: Object.keys(sessions).length, usernames: Object.values(sessions).map(s => s.username) });
      console.log('Pseudo changé : ' + oldUsername + ' -> ' + newUsername);
    } catch(e) {
      socket.emit('change_username_error', 'Erreur serveur.');
    }
  });

  // ---------- FERMES COOPERATIVES ----------
  socket.on('coop_create', async ({ farmName }) => {
    const sess = sessions[socket.id];
    if (!sess) return socket.emit('coop_error', 'Non authentifié.');
    const name = String(farmName||'').trim().slice(0,30);
    if (!name) return socket.emit('coop_error', 'Nom de ferme invalide.');
    const existing = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    if (existing) return socket.emit('coop_error', 'Vous êtes déjà dans une ferme coopérative.');
    const farmId = 'coop_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const plots = [];
    for (let i = 0; i < 4; i++) plots.push({id:i, st:'empty', crop:null, planted:null, owner:null});
    coopFarms[farmId] = { id:farmId, name, leader:sess.username, members:[sess.username], invites:[], plots, harvested:{}, logs:[], createdAt:Date.now() };
    await persistCoopFarm(coopFarms[farmId]);
    socket.emit('coop_update', coopFarms[farmId]);
    console.log('Ferme coop creee : ' + name + ' par ' + sess.username);
  });

  socket.on('coop_invite', async ({ to }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const farm = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    if (!farm) return socket.emit('coop_error', "Vous n'êtes pas dans une ferme coopérative.");
    if (farm.members.length >= 4) return socket.emit('coop_error', 'La ferme est complète (4 membres max).');
    if (farm.members.includes(to)) return socket.emit('coop_error', to + ' est déjà membre.');
    if (!await areFriends(sess.username, to)) return socket.emit('coop_error', 'Vous devez être amis pour inviter.');
    if (Object.values(coopFarms).find(f => f.members.includes(to))) return socket.emit('coop_error', to + ' est déjà dans une ferme coopérative.');
    if (farm.invites.find(inv => inv.to === to)) return socket.emit('coop_error', 'Invitation déjà envoyée.');
    farm.invites.push({ to, from: sess.username, ts: Date.now() });
    socket.emit('coop_invite_sent', { to, farmName: farm.name });
    const targetSock = getSocketByUsername(to);
    if (targetSock) io.to(targetSock.socketId).emit('coop_invite_received', { farmId: farm.id, farmName: farm.name, from: sess.username });
  });

  socket.on('coop_join', async ({ farmId }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const farm = coopFarms[farmId];
    if (!farm) return socket.emit('coop_error', 'Ferme introuvable.');
    if (farm.members.length >= 4) return socket.emit('coop_error', 'La ferme est complète.');
    const inv = farm.invites.find(i => i.to === sess.username);
    if (!inv) return socket.emit('coop_error', "Vous n'avez pas été invité.");
    if (Object.values(coopFarms).find(f => f.members.includes(sess.username))) return socket.emit('coop_error', 'Vous êtes déjà dans une ferme coopérative.');
    farm.members.push(sess.username);
    farm.invites = farm.invites.filter(i => i.to !== sess.username);
    farm.logs.unshift({ t: new Date().toLocaleTimeString('fr'), txt: sess.username + ' a rejoint la ferme !', cls:'ok' });
    await persistCoopFarm(farm);
    farm.members.forEach(m => {
      const s = getSocketByUsername(m);
      if (s) io.to(s.socketId).emit('coop_update', farm);
    });
  });

  socket.on('coop_decline', ({ farmId }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const farm = coopFarms[farmId];
    if (!farm) return;
    farm.invites = farm.invites.filter(i => i.to !== sess.username);
    socket.emit('coop_invite_declined', { farmId });
  });

  socket.on('coop_plant', async ({ plotId, seedId }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const farm = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    if (!farm) return socket.emit('coop_error', "Vous n'êtes pas dans une ferme coopérative.");
    const plot = farm.plots.find(p => p.id === plotId);
    if (!plot || plot.st !== 'empty') return socket.emit('coop_error', 'Parcelle non disponible.');
    const seed = COOP_SEEDS.find(s => s.id === seedId);
    if (!seed) return socket.emit('coop_error', 'Graine coop invalide.');
    const state = playerStates[sess.playerId];
    if (!state) return;
    if (state.wallet < seed.pr) return socket.emit('coop_error', 'Solde insuffisant.');
    state.wallet -= seed.pr;
    state.spent = (state.spent||0) + seed.pr;
    plot.st = 'growing'; plot.crop = seedId; plot.planted = Date.now(); plot.owner = sess.username;
    farm.logs.unshift({ t: new Date().toLocaleTimeString('fr'), txt: sess.username + ' a planté ' + seed.ico + ' ' + seed.nm, cls:'inf' });
    if (farm.logs.length > 50) farm.logs.pop();
    persistPlayerState(sess.playerId, sess.username, state);
    persistCoopFarm(farm);
    socket.emit('state_update', { state });
    farm.members.forEach(m => {
      const s = getSocketByUsername(m);
      if (s) io.to(s.socketId).emit('coop_update', farm);
    });
  });

  socket.on('coop_harvest', async ({ plotId }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const farm = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    if (!farm) return;
    const plot = farm.plots.find(p => p.id === plotId);
    if (!plot || plot.st !== 'ready') return socket.emit('coop_error', 'Parcelle non prête.');
    const seed = COOP_SEEDS.find(s => s.id === plot.crop);
    if (!seed) return;
    if (!farm.harvested[seed.id]) farm.harvested[seed.id] = { qty: 0 };
    farm.harvested[seed.id].qty++;
    plot.st = 'empty'; plot.crop = null; plot.planted = null; plot.owner = null;
    farm.logs.unshift({ t: new Date().toLocaleTimeString('fr'), txt: sess.username + ' a récolté ' + seed.ico + ' ' + seed.nm, cls:'ok' });
    if (farm.logs.length > 50) farm.logs.pop();
    persistCoopFarm(farm);
    farm.members.forEach(m => {
      const s = getSocketByUsername(m);
      if (s) io.to(s.socketId).emit('coop_update', farm);
    });
  });

  socket.on('coop_sell', async ({ seedId }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const farm = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    if (!farm) return socket.emit('coop_error', "Vous n'êtes pas dans une ferme coopérative.");
    const inv = farm.harvested[seedId];
    if (!inv || !inv.qty) return socket.emit('coop_error', 'Rien à vendre.');
    const seed = COOP_SEEDS.find(s => s.id === seedId);
    if (!seed) return;
    const qty = inv.qty;
    const gross = seed.bv * qty;
    const fee = gross * COM;
    const net = gross - fee;
    const share = net / farm.members.length;
    delete farm.harvested[seedId];
    farm.logs.unshift({ t: new Date().toLocaleTimeString('fr'), txt: sess.username + ' a vendu ' + qty + '× ' + seed.ico + ' -> +' + net.toFixed(4) + ' USDC partagé', cls:'pos' });
    if (farm.logs.length > 50) farm.logs.pop();
    persistCoopFarm(farm);
    farm.members.forEach(m => {
      const memberSess = getSocketByUsername(m);
      if (!memberSess) return;
      const mState = playerStates[memberSess.playerId];
      if (!mState) return;
      mState.wallet = f4(mState.wallet + share);
      mState.earned = f4(mState.earned + share);
      mState.fees   = f4((mState.fees||0) + (fee/farm.members.length));
      logState(mState, 'Coop vente ' + seed.ico + ' ' + seed.nm + ' x' + qty + ' — part : +' + share.toFixed(4) + ' USDC', 'pos');
      logTxState(mState, 'sell', '[COOP] ' + qty + 'x ' + seed.ico + ' ' + seed.nm, share);
      persistPlayerState(memberSess.playerId, m, mState);
      io.to(memberSess.socketId).emit('state_update', { state: mState });
      io.to(memberSess.socketId).emit('coop_update', farm);
    });
  });

  socket.on('coop_leave', async () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const farm = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    if (!farm) return;
    if (farm.leader === sess.username && farm.members.length > 1) {
      farm.leader = farm.members.find(m => m !== sess.username);
    }
    farm.members = farm.members.filter(m => m !== sess.username);
    farm.logs.unshift({ t: new Date().toLocaleTimeString('fr'), txt: sess.username + ' a quitté la ferme.', cls:'neg' });
    if (farm.members.length === 0) {
      // Supprimer la ferme de Supabase
      sbFetch(`coop_farms?id=eq.${encodeURIComponent(farm.id)}`, 'DELETE').catch(()=>{});
      delete coopFarms[farm.id];
    } else {
      persistCoopFarm(farm);
      farm.members.forEach(m => {
        const s = getSocketByUsername(m);
        if (s) io.to(s.socketId).emit('coop_update', farm);
      });
    }
    socket.emit('coop_left');
  });

  socket.on('get_coop', () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const farm = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    if (farm) socket.emit('coop_update', farm);
    else socket.emit('coop_none');
  });

  socket.on('get_coop_seeds', () => {
    socket.emit('coop_seeds', COOP_SEEDS);
  });

  // ---------- FORCE INIT DONE (correction vieux comptes) ----------
  socket.on('force_init_done', () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const state = playerStates[sess.playerId];
    if (!state) return;
    if (!state.initDone) {
      state.initDone = true;
      // S'assurer que le plot 0 n'est pas bloqué en 'init'
      if (state.plots && state.plots[0] && state.plots[0].st === 'init') {
        state.plots[0].st = 'empty';
        state.plots[0].crop = null;
        state.plots[0].planted = null;
      }
      persistPlayerState(sess.playerId, sess.username, state);
      console.log('🔧 initDone forcé pour:', sess.username);
    }
  });

  // ---------- SET NAME COLOR ----------
  socket.on('set_name_color', ({ color }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const allowed = ['#8eff5a','#ffcc22','#5599ff','#aa44ff','#ff4444','#ff8844','#44ffdd','#ff88cc','#ffffff','#7eb87a'];
    if (!allowed.includes(color)) return;
    playerColors[sess.username] = color;
    socket.emit('name_color_ok', { color });
  });

  // ---------- CHAT GLOBAL ----------
  socket.on('chat_global', ({ text }) => {
    const sess = sessions[socket.id];
    if (!sess || !text) return;
    const clean = String(text).trim().slice(0, 200);
    if (!clean) return;
    const entry = {
      from: sess.username,
      text: clean,
      ts: Date.now(),
      avatar: playerAvatars[sess.username] || null,
      nameColor: playerColors[sess.username] || null
    };
    globalChatHistory.push(entry);
    if (globalChatHistory.length > 100) globalChatHistory.shift();
    io.emit('chat_global', entry);
  });

  socket.on('get_chat_history', () => {
    socket.emit('chat_history', globalChatHistory.slice(-60));
  });

  // ---------- CHAT PRIVÉ ----------
  socket.on('private_message', ({ to, text }) => {
    const sess = sessions[socket.id];
    if (!sess || !to || !text) return;
    const clean = String(text).trim().slice(0, 500);
    if (!clean) return;
    const entry = {
      from: sess.username, to,
      text: clean, ts: Date.now(),
      avatar: playerAvatars[sess.username] || null,
      nameColor: playerColors[sess.username] || null
    };
    const key = [sess.username, to].sort().join('|');
    if (!privateMessages[key]) privateMessages[key] = [];
    privateMessages[key].push(entry);
    if (privateMessages[key].length > 200) privateMessages[key].shift();

    // Send to sender
    socket.emit('private_message', { to, entry, incoming: false });
    // Send to recipient if online
    const toSess = getSocketByUsername(to);
    if (toSess) io.to(toSess.socketId).emit('private_message', { to: sess.username, entry, incoming: true });
  });

  socket.on('get_private_history', ({ with: other }) => {
    const sess = sessions[socket.id];
    if (!sess || !other) return;
    const key = [sess.username, other].sort().join('|');
    socket.emit('private_history', { with: other, history: privateMessages[key] || [] });
  });

  // ---------- AVATAR ----------
  socket.on('set_avatar', ({ avatar }) => {
    const sess = sessions[socket.id];
    if (!sess || !avatar) return;
    if (avatar.length > 600000) return socket.emit('game_error', 'Image trop lourde.');
    playerAvatars[sess.username] = avatar;
    socket.emit('avatar_saved');
    io.emit('avatar_update', { username: sess.username, avatar });
  });

  // Batch avatar request - send cached avatars for multiple usernames
  socket.on('get_avatars', ({ usernames }) => {
    if (!Array.isArray(usernames)) return;
    const batch = {};
    usernames.forEach(u => {
      if (playerAvatars[u]) batch[u] = playerAvatars[u];
    });
    if (Object.keys(batch).length) socket.emit('avatars_batch', batch);
  });

  // ---------- DÉCONNEXION ----------
  socket.on('disconnect', async () => {
    const sess = sessions[socket.id];
    if (sess) {
      const state = playerStates[sess.playerId];
      if (state) await persistPlayerState(sess.playerId, sess.username, state);
      console.log('👋 Déconnexion:', sess.username);
      delete sessions[socket.id];
      // Broadcast updated online player list
      io.emit('players_online', { count: Object.keys(sessions).length, usernames: Object.values(sessions).map(s => s.username) });
    }
  });
});

// ===== HELPER: BUILD FRIENDS DATA =====
async function buildFriendsData(friendNames) {
  if (!friendNames.length) return [];
  const result = [];
  for (const name of friendNames) {
    try {
      const rows = await sbFetch(`saves?username=eq.${encodeURIComponent(name)}&select=username,wallet,plots_owned,total_earned,updated_at`);
      if (rows && rows.length) {
        const r = rows[0];
        result.push({
          username: r.username,
          wallet:   parseFloat(r.wallet || 0),
          earned:   parseFloat(r.total_earned || 0),
          plots:    r.plots_owned || 0,
          updatedAt: r.updated_at
        });
      } else {
        result.push({ username: name, wallet: 0, earned: 0, plots: 0, updatedAt: null });
      }
    } catch(e) {
      result.push({ username: name, wallet: 0, earned: 0, plots: 0, updatedAt: null });
    }
  }
  return result;
}

// ================================================================
//  TERRACAPITAL — SYSTÈMES AVANCÉS
//  • Missions journalières infinies (générées algorithmiquement)
//  • Enchères publiques + graines rares exclusives par enchère
//  • Prêts entre joueurs
//  • Fermes coopératives
//  → Tout persisté en Supabase
// ================================================================

// ----------------------------------------------------------------
//  HELPERS SUPABASE SPÉCIALISÉS
// ----------------------------------------------------------------
async function sbUpsert(table, data, conflictCol) {
  const headers = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=representation'
  };
  const url = SB_URL + '/rest/v1/' + table;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const txt = await r.text().catch(() => '');
    try { return JSON.parse(txt); } catch(e) { return null; }
  } catch(e) {
    clearTimeout(timeout);
    console.error('sbUpsert error [' + table + ']:', e.message);
    return null;
  }
}

// ----------------------------------------------------------------
//  XP / NIVEAUX
// ----------------------------------------------------------------
const XP_LEVELS = [
  { level:1,  xp:0,     label:'Apprenti',       color:'#7eb87a' },
  { level:2,  xp:50,    label:'Cultivateur',     color:'#8eff5a' },
  { level:3,  xp:150,   label:'Fermier',         color:'#ffcc22' },
  { level:4,  xp:350,   label:'Agronome',        color:'#ff8844' },
  { level:5,  xp:700,   label:'Expert',          color:'#5599ff' },
  { level:6,  xp:1200,  label:'Maître',          color:'#aa44ff' },
  { level:7,  xp:2000,  label:'Grand Maître',    color:'#ff4444' },
  { level:8,  xp:3200,  label:'Légende',         color:'#ff88cc' },
  { level:9,  xp:5000,  label:'Mythique',        color:'#44ffdd' },
  { level:10, xp:8000,  label:'Dieu des Champs', color:'#ffffff' },
];

function getPlayerLevel(xp) {
  let cur = XP_LEVELS[0];
  for (const l of XP_LEVELS) { if (xp >= l.xp) cur = l; else break; }
  const nextIdx = XP_LEVELS.indexOf(cur) + 1;
  const next = XP_LEVELS[nextIdx] || null;
  return { ...cur, nextXp: next ? next.xp : null, nextLabel: next ? next.label : null };
}

function grantXP(state, amount) {
  if (!state) return { levelUp: false };
  if (!state.xp) state.xp = 0;
  const before = getPlayerLevel(state.xp);
  state.xp += amount;
  const after = getPlayerLevel(state.xp);
  if (after.level > before.level) {
    logState(state, `🎉 Niveau ${after.level} — ${after.label} !`, 'ok');
    return { levelUp: true, level: after };
  }
  return { levelUp: false };
}

// ----------------------------------------------------------------
//  MISSIONS JOURNALIÈRES INFINIES
// ----------------------------------------------------------------
// On génère chaque jour 5 missions à partir de la seed de la date
// => déterministe côté serveur, infiniment varié de jour en jour

const ALL_CROPS = SEEDS.map(s => s);  // référence complète

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

// Générateur pseudo-aléatoire déterministe (LCG) basé sur un entier seed
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
}

function dateToSeed(dateStr) {
  // 'YYYY-MM-DD' → entier
  return dateStr.split('-').reduce((acc, n) => acc * 100 + parseInt(n), 0);
}

// Modèles de missions ; les %CROP% sont remplacés par une graine tirée aléatoirement
const MISSION_TEMPLATES = [
  // Récolte culture unique
  { type:'harvest', crop:'RANDOM', qtyMin:1, qtyMax:5,
    desc: (s,q) => `Récolter ${q} ${s.ico} ${s.nm}`,
    rewardFn: (s,q) => f4(Math.max(0.05, s.bv * q * 0.35)) },
  { type:'harvest', crop:'RANDOM', qtyMin:2, qtyMax:8,
    desc: (s,q) => `Récolter ${q} ${s.ico} ${s.nm} ce jour`,
    rewardFn: (s,q) => f4(Math.max(0.08, s.bv * q * 0.40)) },
  // Récolte continentale
  { type:'harvest_region', crop:'RANDOM_EUROPE', qtyMin:3, qtyMax:6,
    desc: (s,q) => `Récolter ${q} cultures européennes (dont ${s.ico} ${s.nm})`,
    rewardFn: (s,q) => f4(0.10 + q * 0.02) },
  { type:'harvest_region', crop:'RANDOM_ASIE', qtyMin:3, qtyMax:6,
    desc: (s,q) => `Récolter ${q} cultures asiatiques (dont ${s.ico} ${s.nm})`,
    rewardFn: (s,q) => f4(0.12 + q * 0.025) },
  { type:'harvest_region', crop:'RANDOM_AMERIQUES', qtyMin:2, qtyMax:5,
    desc: (s,q) => `Récolter ${q} cultures des Amériques`,
    rewardFn: (s,q) => f4(0.10 + q * 0.03) },
  // Ventes
  { type:'sell', crop:null, qtyMin:3, qtyMax:12,
    desc: (s,q) => `Vendre ${q} récoltes au marché`,
    rewardFn: (s,q) => f4(0.08 + q * 0.015) },
  { type:'earn', crop:null, qtyMin:0.2, qtyMax:3,
    desc: (s,q) => `Gagner ${q.toFixed(2)} USDC en ventes`,
    rewardFn: (s,q) => f4(q * 0.20) },
  // Plantation
  { type:'plant', crop:null, qtyMin:3, qtyMax:8,
    desc: (s,q) => `Planter ${q} cultures`,
    rewardFn: (s,q) => f4(0.06 + q * 0.01) },
  { type:'plant', crop:'RANDOM', qtyMin:2, qtyMax:4,
    desc: (s,q) => `Planter ${q} ${s.ico} ${s.nm}`,
    rewardFn: (s,q) => f4(Math.max(0.05, s.bv * q * 0.15)) },
  // Rare
  { type:'harvest', crop:'RANDOM_RARE', qtyMin:1, qtyMax:2,
    desc: (s,q) => `Récolter ${q} ${s.ico} ${s.nm} (culture rare)`,
    rewardFn: (s,q) => f4(Math.max(0.40, s.bv * q * 0.50)) },
  // Commerce
  { type:'sell_value', crop:null, qtyMin:0.5, qtyMax:5,
    desc: (s,q) => `Vendre pour ${q.toFixed(2)} USDC ou plus`,
    rewardFn: (s,q) => f4(q * 0.18) },
  // Coopération
  { type:'coop_harvest', crop:null, qtyMin:1, qtyMax:3,
    desc: (s,q) => `Récolter ${q} culture(s) dans ta ferme coop`,
    rewardFn: (s,q) => f4(0.15 + q * 0.10) },
];

const RARE_CROPS = SEEDS.filter(s => s.bv >= 2.0);
const EUROPE_CROPS = SEEDS.filter(s => s.reg === 'Europe');
const ASIE_CROPS   = SEEDS.filter(s => s.reg === 'Asie');
const AMERIQUES_CROPS = SEEDS.filter(s => s.reg === 'Amériques');

function pickCrop(type, rng) {
  if (type === 'RANDOM_RARE') return RARE_CROPS[Math.floor(rng() * RARE_CROPS.length)];
  if (type === 'RANDOM_EUROPE') return EUROPE_CROPS[Math.floor(rng() * EUROPE_CROPS.length)];
  if (type === 'RANDOM_ASIE') return ASIE_CROPS[Math.floor(rng() * ASIE_CROPS.length)];
  if (type === 'RANDOM_AMERIQUES') return AMERIQUES_CROPS[Math.floor(rng() * AMERIQUES_CROPS.length)];
  return ALL_CROPS[Math.floor(rng() * ALL_CROPS.length)];
}

function generateMissionsForDate(dateStr) {
  const rng = makePRNG(dateToSeed(dateStr));
  const missions = [];
  const usedTemplates = new Set();

  while (missions.length < 5) {
    const tIdx = Math.floor(rng() * MISSION_TEMPLATES.length);
    if (usedTemplates.has(tIdx) && usedTemplates.size < MISSION_TEMPLATES.length) continue;
    usedTemplates.add(tIdx);
    const tpl = MISSION_TEMPLATES[tIdx];

    const isFloat = (tpl.qtyMin < 1 || tpl.type === 'earn' || tpl.type === 'sell_value');
    const qty = isFloat
      ? parseFloat((tpl.qtyMin + rng() * (tpl.qtyMax - tpl.qtyMin)).toFixed(2))
      : Math.round(tpl.qtyMin + rng() * (tpl.qtyMax - tpl.qtyMin));

    const seed = tpl.crop ? pickCrop(tpl.crop, rng) : null;
    const reward = tpl.rewardFn(seed || {bv:0.10}, qty);

    missions.push({
      id: `m_${dateStr}_${tIdx}_${missions.length}`,
      type: tpl.type,
      crop: seed ? seed.id : null,
      cropRegion: tpl.crop && tpl.crop.startsWith('RANDOM_') ? tpl.crop.replace('RANDOM_','') : null,
      qty,
      desc: tpl.desc(seed || {ico:'🌱',nm:'culture'}, qty),
      icon: seed ? seed.ico : '🎯',
      reward,
    });
  }
  return missions;
}

// Cache missions du jour en mémoire
let _dailyMissionsCache = { date: '', missions: [] };

function getDailyMissions() {
  const today = getTodayStr();
  if (_dailyMissionsCache.date !== today) {
    _dailyMissionsCache = { date: today, missions: generateMissionsForDate(today) };
    // Reset progression en mémoire
    Object.keys(_missionProgress).forEach(pid => { _missionProgress[pid] = {}; });
    io.emit('daily_missions', { date: today, missions: _dailyMissionsCache.missions.map(m => ({...m, progress:0, done:false})) });
    console.log('🎯 Nouvelles missions :', today);
  }
  return _dailyMissionsCache;
}

// Progression missions en mémoire { playerId: { missionId: progress } }
const _missionProgress = {};

function getMissionPayload(playerId) {
  const dm = getDailyMissions();
  const prog = _missionProgress[playerId] || {};
  return {
    date: dm.date,
    missions: dm.missions.map(m => ({ ...m, progress: prog[m.id] || 0, done: (prog[m.id] || 0) >= m.qty }))
  };
}

function trackMission(sess, state, type, cropId, amount) {
  if (!sess || !state) return;
  const dm = getDailyMissions();
  if (!_missionProgress[sess.playerId]) _missionProgress[sess.playerId] = {};
  const prog = _missionProgress[sess.playerId];

  let completedAny = false;
  dm.missions.forEach(m => {
    const cur = prog[m.id] || 0;
    if (cur >= m.qty) return;
    let add = 0;

    if (m.type === 'harvest' && type === 'harvest' && m.crop === cropId) add = 1;
    else if (m.type === 'harvest_region' && type === 'harvest') {
      const s = SEEDS.find(x => x.id === cropId);
      if (s) {
        if (m.cropRegion === 'EUROPE' && s.reg === 'Europe') add = 1;
        else if (m.cropRegion === 'ASIE' && s.reg === 'Asie') add = 1;
        else if (m.cropRegion === 'AMERIQUES' && s.reg === 'Amériques') add = 1;
      }
    }
    else if (m.type === 'sell' && type === 'sell') add = 1;
    else if (m.type === 'earn' && type === 'earn') add = amount;
    else if (m.type === 'sell_value' && type === 'earn') add = amount;
    else if (m.type === 'plant' && type === 'plant' && (!m.crop || m.crop === cropId)) add = 1;
    else if (m.type === 'coop_harvest' && type === 'coop_harvest') add = 1;

    if (add === 0) return;
    prog[m.id] = Math.min(m.qty, cur + add);

    // Complétion
    const doneKey = `mDone_${dm.date}_${m.id}`;
    if (prog[m.id] >= m.qty && !state[doneKey]) {
      state[doneKey] = true;
      state.wallet = f4(state.wallet + m.reward);
      state.earned = f4(state.earned + m.reward);
      logState(state, `🎯 Mission : ${m.icon} ${m.desc} — +${m.reward.toFixed(4)} USDC`, 'ok');
      const lvRes = grantXP(state, 20);
      completedAny = true;
      const sk = getSocketByUsername(sess.username);
      if (sk) {
        io.to(sk.socketId).emit('mission_completed', { mission: m, reward: m.reward });
        if (lvRes.levelUp) io.to(sk.socketId).emit('level_up', lvRes);
        io.to(sk.socketId).emit('state_update', { state });
      }
    }
  });

  const sk = getSocketByUsername(sess.username);
  if (sk) sk.socketId && io.to(sk.socketId).emit('daily_missions', getMissionPayload(sess.playerId));
}

// Vérification reset minuit toutes les minutes
setInterval(() => { getDailyMissions(); }, 60000);
getDailyMissions();

// ----------------------------------------------------------------
//  GRAINES RARES EXCLUSIVES PAR ENCHÈRE
// ----------------------------------------------------------------
const AUCTION_EXCLUSIVE_SEEDS = [
  // ── Originales ──
  { id:'exc_golden_root',   nm:'Racine Dorée',        ico:'🌿', bv:22.00, gMs:7200000,  hMs:2400000, desc:'Pousse une seule fois par éclipse. Introuvable autrement.' },
  { id:'exc_void_melon',    nm:'Melon du Néant',       ico:'🌑', bv:25.00, gMs:10800000, hMs:3600000, desc:'Fruit des abysses, introuvable en boutique.' },
  { id:'exc_solar_spice',   nm:'Épice Solaire',        ico:'☀️',  bv:32.00, gMs:14400000, hMs:4800000, desc:'Condiment mythique capturant la chaleur du soleil.' },
  { id:'exc_celestial_fig', nm:'Figue Céleste',        ico:'✨', bv:21.00, gMs:5400000,  hMs:1800000, desc:'Pousse sous les étoiles, uniquement aux enchères.' },
  { id:'exc_phantom_rice',  nm:'Riz Fantôme',          ico:'👻', bv:22.00, gMs:9000000,  hMs:3000000, desc:'Variété spectrale aux propriétés inconnues.' },
  { id:'exc_crimson_truffe',nm:'Truffe Cramoisie',     ico:'🔴', bv:40.00, gMs:21600000, hMs:7200000, desc:'La truffe la plus précieuse au monde.' },
  { id:'exc_moon_cherry',   nm:'Cerise Lunaire',       ico:'🌙', bv:20.00, gMs:3600000,  hMs:1200000, desc:'Ne fleurit qu\'à la pleine lune.' },
  { id:'exc_dragon_pepper', nm:'Poivre du Dragon',     ico:'🐉', bv:28.00, gMs:12600000, hMs:4200000, desc:'Un million de Scoville. Interdit à la vente ordinaire.' },
  { id:'exc_aurora_berry',  nm:'Baie Aurore',          ico:'🌈', bv:20.00, gMs:8100000,  hMs:2700000, desc:'Capte les aurores boréales pour concentrer ses arômes.' },
  { id:'exc_abyss_vanilla', nm:'Vanille des Abysses',  ico:'🫧', bv:35.00, gMs:18000000, hMs:6000000, desc:'Vanilla planifolia grandis — espèce considérée éteinte.' },
  // ── Nouvelles ──
  { id:'exc_obsidian_grape',nm:'Raisin Obsidien',      ico:'🖤', bv:38.00, gMs:19800000, hMs:6600000, desc:'Cépage volcanique aux reflets métalliques. Vin rarissime.' },
  { id:'exc_prism_lotus',   nm:'Lotus Prisme',         ico:'🌈', bv:45.00, gMs:28800000, hMs:9600000, desc:'Fleur qui décompose la lumière en 7 couleurs. Médicinale.' },
  { id:'exc_thunder_melon', nm:'Melon Tonnerre',       ico:'⚡', bv:24.00, gMs:10080000, hMs:3360000, desc:'Pousse uniquement après les orages. Électrise les papilles.' },
  { id:'exc_frozen_rose',   nm:'Rose Glacée',          ico:'🌹', bv:29.00, gMs:13500000, hMs:4500000, desc:'Fleurit dans les zones de gel extrême. Parfum cristallin.' },
  { id:'exc_ember_cacao',   nm:'Cacao Braise',         ico:'🔥', bv:33.00, gMs:16200000, hMs:5400000, desc:'Cacao fermenté dans des braises volcaniques. Intense.' },
  { id:'exc_silver_moss',   nm:'Mousse Argentée',      ico:'🌫️', bv:26.00, gMs:11700000, hMs:3900000, desc:'Pousse dans les ruines antiques. Propriétés alchimiques.' },
  { id:'exc_nebula_fig',    nm:'Figue Nébuleuse',      ico:'💜', bv:31.00, gMs:15300000, hMs:5100000, desc:'Taches cosmiques sur la peau. Goût de cosmos et de miel.' },
  { id:'exc_titan_truffe',  nm:'Truffe Titan',         ico:'⚫', bv:55.00, gMs:32400000, hMs:10800000,desc:'Record mondial : 2 kg pour un spécimen. Arôme de terre noire.' },
  { id:'exc_sapphire_tea',  nm:'Thé Saphir',           ico:'🔵', bv:42.00, gMs:25200000, hMs:8400000, desc:'Infusion aux feuilles bleutées. Sérénité immédiate garantie.' },
  { id:'exc_golden_pepper', nm:'Poivre d\'Or',         ico:'💛', bv:36.00, gMs:18900000, hMs:6300000, desc:'Cultivé sous les aurores. Chaque graine pèse son poids en or.' },
  { id:'exc_voidbloom',     nm:'Floraison du Vide',    ico:'🌌', bv:50.00, gMs:30600000, hMs:10200000,desc:'Fleur interdimensionnelle. S\'ouvre une fois tous les cent ans.' },
  { id:'exc_crystal_mint',  nm:'Menthe Cristal',       ico:'💎', bv:23.00, gMs:9900000,  hMs:3300000, desc:'Fraîcheur absolue. Cristallise l\'air autour d\'elle.' },
];

// ===== SAISONS =====
// Les saisons sont calquées sur le CALENDRIER RÉEL (hémisphère nord)
// Printemps : mars-mai  |  Été : juin-août  |  Automne : sept-nov  |  Hiver : déc-fév
const SEASONS = [
  {
    id: 'spring', nm: 'Printemps', ico: '🌸', color: '#ff9ec7',
    months: [3, 4, 5], // mars, avril, mai
    seeds: ['wheat','carrot','strawberry','potato','barley','rye','mint','thyme','garlic','onion','cherry','peach','lemon','sunflower','raspberry','rice','papaya','banana','manioc','sweet_potato','corn','pumpkin','millet','sorghum','okra','yam','hibiscus'],
    offSeasonBonus: 0.60
  },
  {
    id: 'summer', nm: 'Été', ico: '☀️', color: '#ffcc22',
    months: [6, 7, 8], // juin, juillet, août
    seeds: ['tomato','grape','peach','sunflower','lavender','pepper','mango','coconut','eggplant','bamboo','ginger','papaya','pineapple','avocado','coffee','cacao','guarana','rubber','corn','banana','yam','okra','rooibos','teff','fonio'],
    offSeasonBonus: 0.50
  },
  {
    id: 'autumn', nm: 'Automne', ico: '🍂', color: '#ff7c2a',
    months: [9, 10, 11], // septembre, octobre, novembre
    seeds: ['apple','pear','fig','grape','mushroom','truffle','hemp','chestnut','quinoa','pecan','cranberry','maple','tobacco','mate','passion','blueberry','blueberry2','pumpkin','corn','garlic','onion','saffron','hazelnut','moringa','baobab','argan','njansang'],
    offSeasonBonus: 0.55
  },
  {
    id: 'winter', nm: 'Hiver', ico: '❄️', color: '#aaccff',
    months: [12, 1, 2], // décembre, janvier, février
    seeds: ['rosemary','thyme','garlic','onion','truffle','saffron','lavender','olive','rye','barley','hemp','tea','jasmine','lotus','wasabi','cardamom','clove','lychee','longan','rambutan','starfruit','dragon','durian','vanilla','argan','shea','macadamia','davidson','bunya','wattleseed','lemon_myrtle','munthari','feijoa','tamarillo','quandong'],
    offSeasonBonus: 0.70
  }
];

// Durée fictive pour la compatibilité avec les clients (1 mois ≈ 30 jours)
const SEASON_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // ~30 jours (pour affichage client uniquement)

// Déterminer la saison selon le mois calendaire réel
function getSeasonIdxByMonth() {
  const month = new Date().getMonth() + 1; // 1-12
  return SEASONS.findIndex(s => s.months.includes(month));
}

// Début du mois courant (pour le calcul du timer client)
function getMonthStartTime() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

// Durée du mois courant en ms
function getCurrentMonthDurationMs() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return end - start;
}

let currentSeasonIdx = getSeasonIdxByMonth();
let currentSeason    = SEASONS[currentSeasonIdx];
let seasonStartTime  = getMonthStartTime();

function getCurrentSeason() { return currentSeason; }

function advanceSeason() {
  currentSeasonIdx = getSeasonIdxByMonth();
  currentSeason    = SEASONS[currentSeasonIdx];
  seasonStartTime  = getMonthStartTime();
  console.log(`🌿 Changement de saison : ${currentSeason.ico} ${currentSeason.nm} (mois réel ${new Date().getMonth()+1})`);
  io.emit('season_change', {
    season: currentSeason,
    seasonIdx: currentSeasonIdx,
    seasonStartTime,
    seasonDuration: getCurrentMonthDurationMs()
  });
  applySeasonShock();
}

function applySeasonShock() {
  const season = currentSeason;
  SEEDS.forEach(s => {
    const inSeason = season.seeds.includes(s.id);
    const cur = globalMarket[s.id] || s.bv;
    if (inSeason) {
      globalMarket[s.id] = Math.max(s.pr * 0.001, cur * 0.90);
    } else {
      const bonus = 1 + season.offSeasonBonus;
      globalMarket[s.id] = Math.min(s.bv * bonus * 1.3, cur * (1 + season.offSeasonBonus * 0.5));
    }
  });
  io.emit('market_update', { market: globalMarket, event: globalEvent, crash: globalCrash, supplyPressure, season: currentSeason, seasonIdx: currentSeasonIdx, seasonStartTime, seasonDuration: getCurrentMonthDurationMs() });
}

// Vérifier changement de saison toutes les heures (basé sur le mois calendaire)
setInterval(() => {
  const expectedIdx = getSeasonIdxByMonth();
  if (expectedIdx !== currentSeasonIdx) advanceSeason();
}, 60 * 60 * 1000); // toutes les heures

// Les graines rares sont dans l'inventaire du joueur gagnant, plantables sur leurs parcelles
// Elles valent cher à la vente (bv élevé)

// ----------------------------------------------------------------
//  ENCHÈRES — PERSISTANCE SUPABASE
// ----------------------------------------------------------------
/*
  Table: auctions
  Colonnes: id, seed_id, seed_name, seed_ico, qty, min_bid, current_bid,
            current_bidder, ends_at, seller_id, seller_name, status,
            created_at, is_exclusive, exclusive_data
*/
const _auctions = {};  // cache mémoire

async function persistAuction(a) {
  await sbUpsert('auctions', {
    id: a.id,
    seed_id: a.seedId,
    seed_name: a.seedName,
    seed_ico: a.seedIco,
    qty: a.qty,
    min_bid: a.minBid,
    current_bid: a.currentBid,
    current_bidder: a.currentBidder || null,
    ends_at: new Date(a.endsAt).toISOString(),
    seller_id: a.sellerId || 'system',
    seller_name: a.sellerName,
    status: a.status,
    created_at: new Date(a.createdAt).toISOString(),
    is_exclusive: a.isExclusive || false,
    exclusive_data: a.exclusiveData ? JSON.stringify(a.exclusiveData) : null,
  });
}

async function loadAuctions() {
  try {
    const rows = await sbFetch('auctions?status=eq.open&order=created_at.desc&limit=200');
    if (!rows) return;
    rows.forEach(r => {
      const a = {
        id: r.id,
        seedId: r.seed_id,
        seedName: r.seed_name,
        seedIco: r.seed_ico,
        qty: r.qty,
        minBid: parseFloat(r.min_bid),
        currentBid: parseFloat(r.current_bid),
        currentBidder: r.current_bidder || null,
        endsAt: new Date(r.ends_at).getTime(),
        sellerId: r.seller_id,
        sellerName: r.seller_name,
        status: r.status,
        createdAt: new Date(r.created_at).getTime(),
        isExclusive: r.is_exclusive || false,
        exclusiveData: r.exclusive_data ? JSON.parse(r.exclusive_data) : null,
      };
      _auctions[a.id] = a;
    });
    console.log(`🔨 ${Object.keys(_auctions).length} enchères chargées depuis Supabase`);
  } catch(e) { console.error('loadAuctions error:', e.message); }
}

async function closeAuction(a) {
  a.status = a.currentBidder ? 'closed' : 'expired';
  await persistAuction(a);

  if (a.currentBidder) {
    // Gagnant : recevoir la graine (en ligne ou hors-ligne)
    const winSess = getSocketByUsername(a.currentBidder);
    // Trouver l'état du gagnant — en mémoire ou charger depuis Supabase
    let wState = winSess ? playerStates[winSess.playerId] : null;
    if (!wState) {
      // Joueur hors-ligne : charger depuis Supabase pour persister la graine
      const rows = await sbFetch(`saves?username=eq.${encodeURIComponent(a.currentBidder)}&select=player_id,save_data`);
      if (rows && rows.length) {
        const pid = rows[0].player_id;
        wState = rows[0].save_data || {};
        if (!wState.harvested) wState.harvested = {};
        if (!wState.seedsInv) wState.seedsInv = {};
        if (!wState.harvested[a.seedId]) wState.harvested[a.seedId] = { qty: 0 };
        // Stocker les métadonnées de la graine pour que le client puisse l'afficher/planter
        Object.assign(wState.harvested[a.seedId], {
          ico: a.seedIco, nm: a.seedName,
          gMs: a.seedGMs || 120000, hMs: a.seedHMs || 60000,
          bv: a.seedBv || 1, isExclusive: !!a.isExclusive
        });
        wState.harvested[a.seedId].qty += a.qty;
        if (!a.isExclusive) wState.seedsInv[a.seedId] = (wState.seedsInv[a.seedId] || 0) + a.qty;
        if (a.isExclusive) {
          if (!wState.exclusiveSeeds) wState.exclusiveSeeds = [];
          if (!wState.exclusiveSeeds.includes(a.seedId)) wState.exclusiveSeeds.push(a.seedId);
        }
        if (!wState.logs) wState.logs = [];
        wState.logs.unshift({ t: new Date().toLocaleTimeString('fr'), txt: `🏆 Enchère remportée (hors-ligne) : ${a.seedIco} ${a.seedName} ×${a.qty}`, cls: 'ok' });
        await persistPlayerState(pid, a.currentBidder, wState);
        console.log(`🏆 Graine ${a.seedName} ajoutée à ${a.currentBidder} (hors-ligne)`);
      }
    } else {
      // Joueur en ligne
      if (!wState.seedsInv) wState.seedsInv = {};
      if (!wState.harvested[a.seedId]) wState.harvested[a.seedId] = { qty: 0 };
      // Stocker les métadonnées de la graine pour que le client puisse l'afficher/planter
      Object.assign(wState.harvested[a.seedId], {
        ico: a.seedIco, nm: a.seedName,
        gMs: a.seedGMs || 120000, hMs: a.seedHMs || 60000,
        bv: a.seedBv || 1, isExclusive: !!a.isExclusive
      });
      wState.harvested[a.seedId].qty += a.qty;
      if (!a.isExclusive) wState.seedsInv[a.seedId] = (wState.seedsInv[a.seedId] || 0) + a.qty;
      if (a.isExclusive) {
        if (!wState.exclusiveSeeds) wState.exclusiveSeeds = [];
        if (!wState.exclusiveSeeds.includes(a.seedId)) wState.exclusiveSeeds.push(a.seedId);
      }
      logState(wState, `🏆 Enchère remportée : ${a.seedIco} ${a.seedName} ×${a.qty} pour ${a.currentBid.toFixed(4)} USDC`, 'ok');
      const lvRes = grantXP(wState, 15);
      persistPlayerState(winSess.playerId, a.currentBidder, wState);
      io.to(winSess.socketId).emit('state_update', { state: wState });
      io.to(winSess.socketId).emit('auction_won', { auction: a });
      if (lvRes.levelUp) io.to(winSess.socketId).emit('level_up', lvRes);
    }

    // Vendeur : recevoir USDC
    if (a.sellerName !== 'SYSTEM') {
      const selSess = getSocketByUsername(a.sellerName);
      if (selSess) {
        const sState = playerStates[selSess.playerId];
        if (sState) {
          const net = f4(a.currentBid * (1 - COM));
          sState.wallet = f4(sState.wallet + net);
          sState.earned = f4(sState.earned + net);
          sState.fees   = f4((sState.fees||0) + f4(a.currentBid * COM));
          logState(sState, `💰 Enchère clôturée : ${a.seedIco} ${a.seedName} — +${net.toFixed(4)} USDC`, 'pos');
          grantXP(sState, 10);
          persistPlayerState(selSess.playerId, a.sellerName, sState);
          io.to(selSess.socketId).emit('state_update', { state: sState });
          io.to(selSess.socketId).emit('auction_sold', { auction: a });
        }
      }
    }
  } else {
    // Pas d'offre : rendre la graine au vendeur si pas système
    if (a.sellerName !== 'SYSTEM') {
      const selSess = getSocketByUsername(a.sellerName);
      if (selSess) {
        const sState = playerStates[selSess.playerId];
        if (sState) {
          const isExcl = a.isExclusive;
          const isNormalSeed = !!SEEDS.find(s => s.id === a.seedId);
          if (isExcl) {
            // Exclusives/mutations → harvested
            if (!sState.harvested[a.seedId]) sState.harvested[a.seedId] = { qty: 0 };
            sState.harvested[a.seedId].qty += a.qty;
          } else if (isNormalSeed) {
            // Graines normales → seedsInv (d'où elles venaient)
            if (!sState.seedsInv) sState.seedsInv = {};
            sState.seedsInv[a.seedId] = (sState.seedsInv[a.seedId] || 0) + a.qty;
          } else {
            // Fallback mutations non-exclusives → harvested
            if (!sState.harvested[a.seedId]) sState.harvested[a.seedId] = { qty: 0 };
            sState.harvested[a.seedId].qty += a.qty;
          }
          logState(sState, `📦 Enchère sans offre — ${a.seedIco} ${a.seedName} ×${a.qty} rendu`, 'neg');
          persistPlayerState(selSess.playerId, a.sellerName, sState);
          io.to(selSess.socketId).emit('state_update', { state: sState });
        }
      }
    }
  }

  io.emit('auction_update', a);
  delete _auctions[a.id];
}

// Boucle fermeture enchères
setInterval(async () => {
  const now = Date.now();
  for (const a of Object.values(_auctions)) {
    if (a.status === 'open' && now >= a.endsAt) {
      await closeAuction(a);
    }
  }
}, 5000);

// ================================================================
//  ENCHÈRE QUOTIDIENNE — 1 graine exclusive par jour, 00h00 → 23h00
// ================================================================
let _dailyAuctionCache = { date: '', auctionId: null };

function getDailyAuctionDateStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function getDailyExclusiveSeed(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) { hash = ((hash << 5) - hash) + dateStr.charCodeAt(i); hash |= 0; }
  return AUCTION_EXCLUSIVE_SEEDS[Math.abs(hash) % AUCTION_EXCLUSIVE_SEEDS.length];
}

async function spawnDailyAuction() {
  const today = getDailyAuctionDateStr();
  if (_dailyAuctionCache.date === today && _dailyAuctionCache.auctionId && _auctions[_dailyAuctionCache.auctionId]) return;

  // Fermer les anciennes enchères quotidiennes système encore ouvertes
  for (const a of Object.values(_auctions)) {
    if (a.isExclusive && a.sellerName === 'SYSTEM' && a.id.startsWith('daily_auc_') && a.status === 'open') {
      await closeAuction(a);
    }
  }

  const seed    = getDailyExclusiveSeed(today);
  const minBid  = f4(seed.bv * 0.50);
  const now     = new Date();
  const endsAt  = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0, 0).getTime();
  const finalEndsAt = Date.now() >= endsAt ? endsAt + 86400000 : endsAt;
  const id      = `daily_auc_${today}`;

  const a = {
    id, seedId: seed.id, seedName: seed.nm, seedIco: seed.ico, qty: 1,
    minBid, currentBid: minBid, currentBidder: null,
    endsAt: finalEndsAt,
    sellerId: 'system', sellerName: 'SYSTEM',
    status: 'open', createdAt: Date.now(),
    isExclusive: true, exclusiveData: { ...seed, dailyAuction: true }
  };
  _auctions[id] = a;
  _dailyAuctionCache = { date: today, auctionId: id };
  await persistAuction(a);
  io.emit('auction_new', a);
  io.emit('rare_auction_alert', { seed, endsAt: a.endsAt, auctionId: id });
  console.log(`✨ Enchère quotidienne : ${seed.nm} → 23h00 (${today})`);
}

setTimeout(spawnDailyAuction, 3000);
setInterval(() => { if (getDailyAuctionDateStr() !== _dailyAuctionCache.date) spawnDailyAuction(); }, 60000);

// ----------------------------------------------------------------
//  PRÊTS — PERSISTANCE SUPABASE
// ----------------------------------------------------------------
/*
  Table: loans
  Colonnes: id, lender_id, lender_name, borrower_id, borrower_name,
            amount, interest_pct, repay_amount, due_at, status, created_at
*/
const _loans = {};
const _loanRequests = {}; // en mémoire uniquement (éphémère)

async function persistLoan(loan) {
  await sbUpsert('loans', {
    id: loan.id,
    lender_id: loan.lenderId,
    lender_name: loan.lenderName,
    borrower_id: loan.borrowerId,
    borrower_name: loan.borrowerName,
    amount: loan.amount,
    interest_pct: loan.interestPct,
    repay_amount: loan.repayAmount,
    due_at: new Date(loan.dueAt).toISOString(),
    status: loan.status,
    created_at: new Date(loan.createdAt).toISOString(),
  });
}

async function loadLoans() {
  try {
    const rows = await sbFetch("loans?status=in.(active,overdue)&order=created_at.desc&limit=500");
    if (!rows) return;
    rows.forEach(r => {
      _loans[r.id] = {
        id: r.id,
        lenderId: r.lender_id, lenderName: r.lender_name,
        borrowerId: r.borrower_id, borrowerName: r.borrower_name,
        amount: parseFloat(r.amount), interestPct: parseFloat(r.interest_pct),
        repayAmount: parseFloat(r.repay_amount),
        dueAt: new Date(r.due_at).getTime(),
        status: r.status,
        createdAt: new Date(r.created_at).getTime(),
      };
    });
    console.log(`💰 ${Object.keys(_loans).length} prêts chargés depuis Supabase`);
  } catch(e) { console.error('loadLoans error:', e.message); }
}

// Vérification échéances prêts toutes les 30s
setInterval(async () => {
  const now = Date.now();
  for (const loan of Object.values(_loans)) {
    if (loan.status === 'active' && now >= loan.dueAt) {
      loan.status = 'overdue';
      await persistLoan(loan);
      const lSess = getSocketByUsername(loan.lenderName);
      const bSess = getSocketByUsername(loan.borrowerName);
      if (lSess) io.to(lSess.socketId).emit('loan_update', loan);
      if (bSess) io.to(bSess.socketId).emit('loan_update', loan);
      console.log(`⚠ Prêt en défaut: ${loan.borrowerName} → ${loan.lenderName}`);
    }
  }
}, 30000);

// ----------------------------------------------------------------
//  FERMES COOP — PERSISTANCE SUPABASE
// ----------------------------------------------------------------
/*
  Table: coop_farms
  Colonnes: id, name, leader, members (jsonb), invites (jsonb),
            plots (jsonb), harvested (jsonb), logs (jsonb), created_at
*/
async function persistCoopFarm(farm) {
  if (!farm || !farm.id) return;
  await sbUpsert('coop_farms', {
    id: farm.id,
    name: farm.name,
    leader: farm.leader,
    members: JSON.stringify(farm.members),
    invites: JSON.stringify(farm.invites),
    plots: JSON.stringify(farm.plots),
    harvested: JSON.stringify(farm.harvested),
    logs: JSON.stringify(farm.logs.slice(0, 50)),
    created_at: new Date(farm.createdAt).toISOString(),
  });
}

async function loadCoopFarms() {
  try {
    const rows = await sbFetch('coop_farms?order=created_at.desc&limit=200');
    if (!rows) return;
    rows.forEach(r => {
      const farm = {
        id: r.id,
        name: r.name,
        leader: r.leader,
        members: typeof r.members === 'string' ? JSON.parse(r.members) : (r.members || []),
        invites: typeof r.invites === 'string' ? JSON.parse(r.invites) : (r.invites || []),
        plots: typeof r.plots === 'string' ? JSON.parse(r.plots) : (r.plots || []),
        harvested: typeof r.harvested === 'string' ? JSON.parse(r.harvested) : (r.harvested || {}),
        logs: typeof r.logs === 'string' ? JSON.parse(r.logs) : (r.logs || []),
        createdAt: new Date(r.created_at).getTime(),
      };
      // Ne garder que les fermes avec au moins 1 membre
      if (farm.members.length > 0) coopFarms[farm.id] = farm;
    });
    console.log(`🌿 ${Object.keys(coopFarms).length} fermes coop chargées depuis Supabase`);
  } catch(e) { console.error('loadCoopFarms error:', e.message); }
}

// Persist fermes coop toutes les 60s
setInterval(async () => {
  for (const farm of Object.values(coopFarms)) {
    await persistCoopFarm(farm);
  }
}, 60000);

// ----------------------------------------------------------------
//  CHARGEMENT AU DÉMARRAGE
// ----------------------------------------------------------------
async function loadAllPersisted() {
  await Promise.all([
    loadAuctions(),
    loadLoans(),
    loadCoopFarms(),
  ]);
  // Diffuser les enchères actives aux clients déjà connectés (redémarrage à chaud)
  io.emit('auctions_list', Object.values(_auctions).filter(a => a.status === 'open'));
}
setTimeout(loadAllPersisted, 2000);

// ----------------------------------------------------------------
//  SOCKET HANDLERS
// ----------------------------------------------------------------
io.on('connection', (socket) => {

  // ── XP / NIVEAU ──────────────────────────────────────────────
  socket.on('get_level', () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const state = playerStates[sess.playerId];
    if (!state) return;
    socket.emit('level_data', { xp: state.xp || 0, ...getPlayerLevel(state.xp || 0) });
  });

  // ── MISSIONS ─────────────────────────────────────────────────
  socket.on('get_daily_missions', () => {
    const sess = sessions[socket.id];
    socket.emit('daily_missions', getMissionPayload(sess ? sess.playerId : '_guest'));
  });

  // ── ENCHÈRES — lister ────────────────────────────────────────
  socket.on('get_auctions', () => {
    socket.emit('auctions_list', Object.values(_auctions).filter(a => a.status === 'open'));
  });

  // ── ENCHÈRES — créer ─────────────────────────────────────────
  socket.on('auction_create', async ({ seedId, qty, minBid, durationMin }) => {
    const sess = sessions[socket.id];
    if (!sess) return socket.emit('auction_error', 'Non authentifié.');
    const state = playerStates[sess.playerId];
    if (!state) return;

    // Chercher dans graines normales OU exclusives OU mutations OU coop déjà possédées
    const seed = findAnySeed(seedId);
    if (!seed) return socket.emit('auction_error', 'Graine introuvable.');
    const isMutSeed = !!MUTATION_SEEDS.find(s => s.id === seedId);
    const isExclSeed = !!AUCTION_EXCLUSIVE_SEEDS.find(s => s.id === seedId);
    const q   = Math.max(1, Math.min(99, parseInt(qty)    || 1));
    const mb  = Math.max(0.0001, parseFloat(minBid)        || (seed.bv * 0.5));
    const dur = Math.max(5,  Math.min(1440, parseInt(durationMin) || 60));

    // Vérifier stock : d'abord harvested (exclusives/mutations), sinon seedsInv (graines normales)
    const inHarvested = (state.harvested[seedId] && state.harvested[seedId].qty >= q);
    const inSeedsInv  = !isExclSeed && !isMutSeed && ((state.seedsInv[seedId] || 0) >= q);
    if (!inHarvested && !inSeedsInv) {
      const totalDispo = (state.harvested[seedId] ? state.harvested[seedId].qty : 0) + (state.seedsInv[seedId] || 0);
      return socket.emit('auction_error', `Stock insuffisant (${totalDispo} dispo).`);
    }

    // Déduire du bon inventaire
    if (inHarvested) {
      state.harvested[seedId].qty -= q;
      if (state.harvested[seedId].qty <= 0) delete state.harvested[seedId];
    } else {
      state.seedsInv[seedId] -= q;
      if (state.seedsInv[seedId] <= 0) delete state.seedsInv[seedId];
    }

    const id = `auc_${sess.playerId}_${Date.now()}`;
    const a = {
      id, seedId, seedName: seed.nm, seedIco: seed.ico, qty: q,
      // Métadonnées pour que le gagnant puisse planter la graine
      seedGMs: seed.gMs || null, seedHMs: seed.hMs || null, seedBv: seed.bv || null,
      minBid: f4(mb), currentBid: f4(mb), currentBidder: null,
      endsAt: Date.now() + dur * 60000,
      sellerId: sess.playerId, sellerName: sess.username,
      status: 'open', createdAt: Date.now(),
      isExclusive: isExclSeed || isMutSeed,
      exclusiveData: isExclSeed ? AUCTION_EXCLUSIVE_SEEDS.find(s => s.id === seedId) : isMutSeed ? {...seed, isMutation: true} : null,
    };
    _auctions[id] = a;
    await persistAuction(a);

    logState(state, `🔨 Enchère : ${seed.ico} ${seed.nm} ×${q} — mise ${mb.toFixed(4)} USDC`, 'inf');
    socket.emit('state_update', { state });
    socket.emit('auction_created', a);
    io.emit('auction_new', a);
    console.log(`🔨 ${sess.username} crée enchère ${seed.nm} ×${q}`);
  });

  // ── ENCHÈRES — enchérir ──────────────────────────────────────
  socket.on('auction_bid', async ({ auctionId, bid }) => {
    const sess = sessions[socket.id];
    if (!sess) return socket.emit('auction_error', 'Non authentifié.');
    const state = playerStates[sess.playerId];
    if (!state) return;
    const a = _auctions[auctionId];
    if (!a || a.status !== 'open') return socket.emit('auction_error', 'Enchère introuvable ou terminée.');
    if (a.sellerName === sess.username) return socket.emit('auction_error', 'Vous ne pouvez pas enchérir sur votre propre vente.');
    if (Date.now() >= a.endsAt) return socket.emit('auction_error', 'Enchère expirée.');
    const b = f4(parseFloat(bid) || 0);
    if (b <= a.currentBid) return socket.emit('auction_error', `Offre trop basse. Minimum : ${f4(a.currentBid + 0.0001)} USDC`);
    if (state.wallet < b) return socket.emit('auction_error', 'Solde insuffisant.');

    // Rembourser l'ancien enchérisseur
    if (a.currentBidder && a.currentBidder !== sess.username) {
      const prevSess = getSocketByUsername(a.currentBidder);
      if (prevSess) {
        const prevState = playerStates[prevSess.playerId];
        if (prevState) {
          prevState.wallet = f4(prevState.wallet + a.currentBid);
          logState(prevState, `🔨 Surenchère — ${a.currentBid.toFixed(4)} USDC remboursé (${a.seedIco} ${a.seedName})`, 'neg');
          io.to(prevSess.socketId).emit('state_update', { state: prevState });
          io.to(prevSess.socketId).emit('auction_outbid', { auction: a, newBid: b, newBidder: sess.username });
        }
      }
    }

    state.wallet = f4(state.wallet - b);
    a.currentBid = b;
    a.currentBidder = sess.username;
    await persistAuction(a);

    logState(state, `🔨 Enchère ${a.seedIco} ${a.seedName} — offre ${b.toFixed(4)} USDC`, 'inf');
    socket.emit('state_update', { state });
    socket.emit('auction_bid_ok', { auctionId, bid: b });
    io.emit('auction_update', a);
    console.log(`🔨 ${sess.username} enchère ${b} USDC sur ${a.seedName}`);
  });

  // ── PRÊTS — proposer ─────────────────────────────────────────
  socket.on('loan_request', async ({ to, amount, interestPct, durationH }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const from = sess.username;
    if (from === to) return socket.emit('loan_error', 'Impossible de se prêter à soi-même.');
    const amt  = f4(Math.max(0.01, Math.min(500, parseFloat(amount) || 0)));
    const rate = Math.max(0, Math.min(100, parseFloat(interestPct) || 5));
    const dur  = Math.max(1, Math.min(720, parseInt(durationH) || 24));
    if (!amt) return socket.emit('loan_error', 'Montant invalide.');
    const state = playerStates[sess.playerId];
    if (!state || state.wallet < amt) return socket.emit('loan_error', 'Solde insuffisant.');
    // Vérifier que le destinataire existe
    const toRows = await sbFetch(`players?username=eq.${encodeURIComponent(to)}&select=id`);
    if (!toRows || !toRows.length) return socket.emit('loan_error', `Joueur "${to}" introuvable.`);
    // Prêts entre amis uniquement
    if (!await areFriends(from, to)) return socket.emit('loan_error', `Vous devez être ami avec "${to}" pour lui proposer un prêt.`);
    if (!_loanRequests[to]) _loanRequests[to] = [];
    if (_loanRequests[to].find(r => r.from === from)) return socket.emit('loan_error', 'Demande déjà envoyée.');
    _loanRequests[to].push({ id: `lreq_${Date.now()}`, from, amount: amt, interestPct: rate, durationH: dur, createdAt: Date.now() });
    socket.emit('loan_request_sent', { to, amount: amt, interestPct: rate });
    const toSess = getSocketByUsername(to);
    if (toSess) io.to(toSess.socketId).emit('loan_request_received', { from, amount: amt, interestPct: rate, durationH: dur, requests: _loanRequests[to] });
    console.log(`💰 Prêt proposé: ${from} → ${to} ${amt} USDC @ ${rate}%`);
  });

  // ── PRÊTS — accepter ─────────────────────────────────────────
  socket.on('loan_accept', async ({ from }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const to = sess.username;
    const reqs = _loanRequests[to] || [];
    const req  = reqs.find(r => r.from === from);
    if (!req) return socket.emit('loan_error', 'Demande introuvable ou expirée.');
    const lenderSess = getSocketByUsername(from);
    if (!lenderSess) return socket.emit('loan_error', 'Le prêteur n\'est plus en ligne.');
    const lenderState = playerStates[lenderSess.playerId];
    if (!lenderState || lenderState.wallet < req.amount) return socket.emit('loan_error', 'Le prêteur n\'a plus les fonds nécessaires.');
    const borrowerState = playerStates[sess.playerId];
    if (!borrowerState) return;

    lenderState.wallet  = f4(lenderState.wallet  - req.amount);
    borrowerState.wallet = f4(borrowerState.wallet + req.amount);
    const repayAmount = f4(req.amount * (1 + req.interestPct / 100));
    const id = `loan_${sess.playerId}_${Date.now()}`;
    const loan = {
      id, lenderId: lenderSess.playerId, lenderName: from,
      borrowerId: sess.playerId, borrowerName: to,
      amount: req.amount, interestPct: req.interestPct,
      repayAmount, dueAt: Date.now() + req.durationH * 3600000,
      status: 'active', createdAt: Date.now(),
    };
    _loans[id] = loan;
    _loanRequests[to] = reqs.filter(r => r.from !== from);

    await persistLoan(loan);
    persistPlayerState(lenderSess.playerId, from, lenderState);
    persistPlayerState(sess.playerId, to, borrowerState);

    logState(lenderState,  `💰 Prêt accordé à ${to} : −${req.amount.toFixed(4)} USDC`, 'neg');
    logState(borrowerState, `💰 Prêt reçu de ${from} : +${req.amount.toFixed(4)} USDC (rembourser ${repayAmount.toFixed(4)})`, 'ok');

    io.to(lenderSess.socketId).emit('state_update', { state: lenderState });
    io.to(lenderSess.socketId).emit('loan_update', loan);
    io.to(lenderSess.socketId).emit('loan_accepted_notify', { by: to, loan });
    socket.emit('state_update', { state: borrowerState });
    socket.emit('loan_update', loan);
    socket.emit('loan_requests_update', _loanRequests[to]);
    console.log(`✅ Prêt actif: ${from} → ${to} ${req.amount} USDC`);
  });

  // ── PRÊTS — refuser ──────────────────────────────────────────
  socket.on('loan_decline', ({ from }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const to = sess.username;
    if (_loanRequests[to]) _loanRequests[to] = _loanRequests[to].filter(r => r.from !== from);
    socket.emit('loan_requests_update', _loanRequests[to] || []);
    const lSess = getSocketByUsername(from);
    if (lSess) io.to(lSess.socketId).emit('loan_declined_notify', { by: to });
  });

  // ── PRÊTS — rembourser ───────────────────────────────────────
  socket.on('loan_repay', async ({ loanId }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const loan = _loans[loanId];
    if (!loan || (loan.status !== 'active' && loan.status !== 'overdue'))
      return socket.emit('loan_error', 'Prêt introuvable ou déjà remboursé.');
    if (loan.borrowerName !== sess.username) return socket.emit('loan_error', 'Ce n\'est pas votre prêt.');
    const borrowerState = playerStates[sess.playerId];
    if (!borrowerState) return;
    if (borrowerState.wallet < loan.repayAmount)
      return socket.emit('loan_error', `Solde insuffisant. Besoin : ${loan.repayAmount.toFixed(4)} USDC.`);

    borrowerState.wallet = f4(borrowerState.wallet - loan.repayAmount);
    loan.status = 'repaid';
    await persistLoan(loan);

    const lSess = getSocketByUsername(loan.lenderName);
    if (lSess) {
      const lState = playerStates[lSess.playerId];
      if (lState) {
        lState.wallet = f4(lState.wallet + loan.repayAmount);
        lState.earned = f4(lState.earned + (loan.repayAmount - loan.amount));
        logState(lState, `💰 Prêt remboursé par ${loan.borrowerName} : +${loan.repayAmount.toFixed(4)} USDC`, 'pos');
        const lvRes = grantXP(lState, 10);
        persistPlayerState(lSess.playerId, loan.lenderName, lState);
        io.to(lSess.socketId).emit('state_update', { state: lState });
        io.to(lSess.socketId).emit('loan_update', loan);
        if (lvRes.levelUp) io.to(lSess.socketId).emit('level_up', lvRes);
      }
    }
    logState(borrowerState, `💰 Prêt remboursé à ${loan.lenderName} : −${loan.repayAmount.toFixed(4)} USDC`, 'neg');
    const lvRes2 = grantXP(borrowerState, 5);
    persistPlayerState(sess.playerId, sess.username, borrowerState);
    socket.emit('state_update', { state: borrowerState });
    socket.emit('loan_update', loan);
    if (lvRes2.levelUp) socket.emit('level_up', lvRes2);
    delete _loans[loanId];
    console.log(`💰 Prêt remboursé: ${loan.borrowerName} → ${loan.lenderName}`);
  });

  // ── PRÊTS — liste ────────────────────────────────────────────
  socket.on('get_loans', async () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    // Charger aussi depuis Supabase pour les prêts hors-ligne
    try {
      const enc = encodeURIComponent(sess.username);
      const rows = await sbFetch(`loans?or=(lender_name.eq.${enc},borrower_name.eq.${enc})&status=in.(active,overdue)&order=created_at.desc&limit=50`);
      if (rows) {
        rows.forEach(r => {
          if (!_loans[r.id]) _loans[r.id] = {
            id: r.id, lenderId: r.lender_id, lenderName: r.lender_name,
            borrowerId: r.borrower_id, borrowerName: r.borrower_name,
            amount: parseFloat(r.amount), interestPct: parseFloat(r.interest_pct),
            repayAmount: parseFloat(r.repay_amount),
            dueAt: new Date(r.due_at).getTime(),
            status: r.status, createdAt: new Date(r.created_at).getTime(),
          };
        });
      }
    } catch(e) {}
    const myLoans = Object.values(_loans).filter(l =>
      l.lenderName === sess.username || l.borrowerName === sess.username
    );
    socket.emit('loans_list', { loans: myLoans, requests: _loanRequests[sess.username] || [] });
  });

  // ── MISSIONS (re-send) ───────────────────────────────────────
  socket.on('get_coop_and_missions_on_reconnect', () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    socket.emit('daily_missions', getMissionPayload(sess.playerId));
    socket.emit('auctions_list', Object.values(_auctions).filter(a => a.status === 'open'));
  });
});

// ----------------------------------------------------------------
//  EXPOSITION GLOBALE pour les handlers harvest/sell/plant
// ----------------------------------------------------------------
global._trackMission   = trackMission;
global._grantXP        = grantXP;
global._getPlayerLevel = getPlayerLevel;

// ================================================================
//  GUERRES DE MARCHÉ (Market Wars)
// ================================================================
/*
  Une guerre de marché oppose deux coops sur une culture donnée.
  Celle qui génère le plus de revenus sur X heures gagne une récompense.
  Structure: marketWars[warId] = { id, crop, duration, endsAt, coops: {coopId: {name, revenue}}, status, createdAt }
*/
const marketWars = {};

async function persistMarketWar(war) {
  try {
    await sbUpsert('market_wars', {
      id: war.id,
      crop_id: war.cropId,
      crop_name: war.cropName,
      crop_ico: war.cropIco,
      duration_ms: war.durationMs,
      ends_at: new Date(war.endsAt).toISOString(),
      coop1_id: war.coop1Id,
      coop1_name: war.coop1Name,
      coop1_revenue: war.coop1Revenue,
      coop2_id: war.coop2Id,
      coop2_name: war.coop2Name,
      coop2_revenue: war.coop2Revenue,
      status: war.status,
      winner_id: war.winnerId || null,
      reward: war.reward,
      created_at: new Date(war.createdAt).toISOString()
    });
  } catch(e) { console.error('persistMarketWar error:', e.message); }
}

async function closeMarketWar(war) {
  if(war.status !== 'active') return;
  war.status = 'closed';
  // Determine winner
  const rev1 = war.coop1Revenue || 0;
  const rev2 = war.coop2Revenue || 0;
  if(rev1 === rev2) {
    war.winnerId = null;
    war.winnerName = 'Égalité';
  } else if(rev1 > rev2) {
    war.winnerId = war.coop1Id;
    war.winnerName = war.coop1Name;
  } else {
    war.winnerId = war.coop2Id;
    war.winnerName = war.coop2Name;
  }
  await persistMarketWar(war);

  // Reward winner members
  if(war.winnerId) {
    const winFarm = coopFarms[war.winnerId];
    if(winFarm) {
      const rewardPerMember = f4(war.reward / winFarm.members.length);
      winFarm.members.forEach(m => {
        const ms = getSocketByUsername(m);
        if(ms) {
          const mState = playerStates[ms.playerId];
          if(mState) {
            mState.wallet = f4(mState.wallet + rewardPerMember);
            mState.earned = f4(mState.earned + rewardPerMember);
            logState(mState, `⚔️ Guerre de marché gagnée ! +${rewardPerMember} USDC (${war.cropIco} ${war.cropName})`, 'ok');
            persistPlayerState(ms.playerId, m, mState);
            io.to(ms.socketId).emit('state_update', { state: mState });
          }
        }
      });
    }
  }

  io.emit('market_war_ended', war);
  delete marketWars[war.id];
  console.log(`⚔️ Guerre de marché terminée : ${war.coop1Name} vs ${war.coop2Name} — Gagnant: ${war.winnerName}`);
}

// Check war endings every 5s
setInterval(async () => {
  const now = Date.now();
  for(const war of Object.values(marketWars)) {
    if(war.status === 'active' && now >= war.endsAt) {
      await closeMarketWar(war);
    }
  }
}, 5000);

// ================================================================
//  MARCHÉ NOIR / OFFRES JOUEUR-À-JOUEUR (Direct Trade)
// ================================================================
/*
  Un joueur propose une vente directe à un autre à prix fixe.
  Structure: directOffers[offerId] = { id, fromUser, toUser, seedId, seedName, seedIco, qty, price, createdAt, status }
*/
const directOffers = {};

// ================================================================
//  SOCKET HANDLERS — GUERRES DE MARCHÉ + MARCHÉ NOIR
// ================================================================
io.on('connection', (socket) => {

  // ── GUERRES DE MARCHÉ ──────────────────────────────────────────
  socket.on('market_war_challenge', async ({ targetCoopId, cropId, durationH, reward }) => {
    const sess = sessions[socket.id];
    if(!sess) return socket.emit('market_war_error', 'Non authentifié.');
    const myFarm = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    if(!myFarm) return socket.emit('market_war_error', 'Vous n\'êtes pas dans une ferme coopérative.');
    if(myFarm.leader !== sess.username) return socket.emit('market_war_error', 'Seul le chef de guilde peut lancer un défi.');
    const targetFarm = coopFarms[targetCoopId];
    if(!targetFarm) return socket.emit('market_war_error', 'Ferme cible introuvable.');
    if(targetFarm.id === myFarm.id) return socket.emit('market_war_error', 'Impossible de se défier soi-même.');

    const seed = findAnySeed(cropId) || SEEDS.find(s => s.id === cropId);
    if(!seed) return socket.emit('market_war_error', 'Culture invalide.');

    const dur = Math.max(1, Math.min(24, parseInt(durationH) || 2));
    const rewardAmt = Math.max(0.05, Math.min(50, parseFloat(reward) || 1.0));
    const warId = `war_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const war = {
      id: warId,
      cropId: seed.id, cropName: seed.nm, cropIco: seed.ico,
      durationMs: dur * 3600000,
      endsAt: Date.now() + dur * 3600000,
      coop1Id: myFarm.id, coop1Name: myFarm.name, coop1Revenue: 0,
      coop2Id: targetFarm.id, coop2Name: targetFarm.name, coop2Revenue: 0,
      status: 'pending',
      reward: rewardAmt,
      createdAt: Date.now(),
      winnerId: null, winnerName: null
    };
    marketWars[warId] = war;

    // Notify challenger
    socket.emit('market_war_created', war);
    // Notify target farm leader
    const targetLeaderSess = getSocketByUsername(targetFarm.leader);
    if(targetLeaderSess) {
      io.to(targetLeaderSess.socketId).emit('market_war_challenge_received', { war, fromFarm: myFarm.name });
    }
    // Notify all target members
    targetFarm.members.forEach(m => {
      const ms = getSocketByUsername(m);
      if(ms && m !== targetFarm.leader) io.to(ms.socketId).emit('market_war_challenge_received', { war, fromFarm: myFarm.name });
    });
    console.log(`⚔️ Défi lancé : ${myFarm.name} vs ${targetFarm.name} sur ${seed.nm}`);
  });

  socket.on('market_war_accept', async ({ warId }) => {
    const sess = sessions[socket.id];
    if(!sess) return;
    const war = marketWars[warId];
    if(!war || war.status !== 'pending') return socket.emit('market_war_error', 'Défi introuvable ou déjà accepté.');
    const myFarm = coopFarms[war.coop2Id];
    if(!myFarm || myFarm.leader !== sess.username) return socket.emit('market_war_error', 'Seul le chef adverse peut accepter.');
    war.status = 'active';
    war.endsAt = Date.now() + war.durationMs;
    await persistMarketWar(war);
    io.emit('market_war_started', war);
    toast_broadcast(`⚔️ Guerre de marché ! ${war.coop1Name} vs ${war.coop2Name} sur ${war.cropIco} ${war.cropName} — ${war.durationMs/3600000}h !`);
    console.log(`⚔️ Guerre acceptée : ${war.coop1Name} vs ${war.coop2Name}`);
  });

  socket.on('market_war_decline', ({ warId }) => {
    const war = marketWars[warId];
    if(!war || war.status !== 'pending') return;
    war.status = 'declined';
    delete marketWars[warId];
    const challengerSess = getSocketByUsername(Object.values(coopFarms).find(f => f.id === war.coop1Id)?.leader || '');
    if(challengerSess) io.to(challengerSess.socketId).emit('market_war_declined', { warId, farmName: war.coop2Name });
    socket.emit('market_war_declined', { warId });
  });

  socket.on('get_market_wars', () => {
    const sess = sessions[socket.id];
    if(!sess) return;
    const myFarm = Object.values(coopFarms).find(f => f.members.includes(sess.username));
    const myFarmId = myFarm ? myFarm.id : null;
    const relevant = Object.values(marketWars).filter(w =>
      w.coop1Id === myFarmId || w.coop2Id === myFarmId || w.status === 'active'
    );
    socket.emit('market_wars_list', relevant);
  });

  // ── MARCHÉ NOIR / OFFRES DIRECTES ─────────────────────────────
  socket.on('direct_offer_create', ({ toUser, seedId, qty, price }) => {
    const sess = sessions[socket.id];
    if(!sess) return socket.emit('direct_offer_error', 'Non authentifié.');
    if(toUser === sess.username) return socket.emit('direct_offer_error', 'Impossible de vous vendre à vous-même.');
    const state = playerStates[sess.playerId];
    if(!state) return;
    const seed = findAnySeed(seedId);
    if(!seed) return socket.emit('direct_offer_error', 'Graine invalide.');
    const q = Math.max(1, Math.min(99, parseInt(qty) || 1));
    const p = Math.max(0.0001, parseFloat(price) || seed.bv);
    const inv = state.harvested[seedId];
    if(!inv || (inv.qty || 0) < q) return socket.emit('direct_offer_error', `Stock insuffisant (${inv ? inv.qty : 0} dispo).`);

    // Reserve the stock
    inv.qty -= q;
    if(inv.qty <= 0) delete state.harvested[seedId];

    const offerId = `offer_${sess.playerId}_${Date.now()}`;
    directOffers[offerId] = {
      id: offerId,
      fromUser: sess.username,
      toUser,
      seedId: seed.id, seedName: seed.nm, seedIco: seed.ico,
      qty: q, price: f4(p),
      createdAt: Date.now(),
      status: 'pending'
    };
    persistPlayerState(sess.playerId, sess.username, state);
    socket.emit('direct_offer_created', directOffers[offerId]);
    socket.emit('state_update', { state });

    // Notify recipient if online
    const targetSess = getSocketByUsername(toUser);
    if(targetSess) {
      io.to(targetSess.socketId).emit('direct_offer_received', directOffers[offerId]);
    }
    console.log(`🏪 Offre directe : ${sess.username} → ${toUser} ${seed.nm} ×${q} @ ${p} USDC`);
  });

  socket.on('direct_offer_accept', async ({ offerId }) => {
    const sess = sessions[socket.id];
    if(!sess) return;
    const offer = directOffers[offerId];
    if(!offer || offer.status !== 'pending') return socket.emit('direct_offer_error', 'Offre introuvable ou déjà traitée.');
    if(offer.toUser !== sess.username) return socket.emit('direct_offer_error', 'Cette offre ne vous est pas destinée.');
    const buyerState = playerStates[sess.playerId];
    if(!buyerState) return;
    if(buyerState.wallet < offer.price) return socket.emit('direct_offer_error', `Solde insuffisant. Besoin : ${offer.price} USDC.`);

    // Transfer money
    buyerState.wallet = f4(buyerState.wallet - offer.price);
    buyerState.spent = f4((buyerState.spent || 0) + offer.price);
    // Transfer seed
    if(!buyerState.harvested[offer.seedId]) buyerState.harvested[offer.seedId] = { qty: 0 };
    buyerState.harvested[offer.seedId].qty += offer.qty;
    logState(buyerState, `🏪 Achat direct : ${offer.seedIco} ${offer.seedName} ×${offer.qty} de ${offer.fromUser} — −${offer.price} USDC`, 'neg');
    logTxState(buyerState, 'buy', `[Direct] ${offer.qty}× ${offer.seedIco} ${offer.seedName}`, -offer.price);

    // Pay seller (minus commission)
    const fee = f4(offer.price * COM);
    const net = f4(offer.price - fee);
    const sellerSess = getSocketByUsername(offer.fromUser);
    if(sellerSess) {
      const sellerState = playerStates[sellerSess.playerId];
      if(sellerState) {
        sellerState.wallet = f4(sellerState.wallet + net);
        sellerState.earned = f4(sellerState.earned + net);
        sellerState.fees = f4((sellerState.fees || 0) + fee);
        logState(sellerState, `🏪 Vente directe : ${offer.seedIco} ${offer.seedName} ×${offer.qty} à ${offer.toUser} — +${net} USDC`, 'pos');
        logTxState(sellerState, 'sell', `[Direct] ${offer.qty}× ${offer.seedIco} ${offer.seedName}`, net);
        persistPlayerState(sellerSess.playerId, offer.fromUser, sellerState);
        io.to(sellerSess.socketId).emit('state_update', { state: sellerState });
        io.to(sellerSess.socketId).emit('direct_offer_completed', { offerId, by: sess.username });
      }
    }

    offer.status = 'accepted';
    persistPlayerState(sess.playerId, sess.username, buyerState);
    socket.emit('state_update', { state: buyerState });
    socket.emit('direct_offer_completed', { offerId, by: sess.username });

    // Track market war revenue for sell of this seed
    trackMarketWarRevenue(offer.fromUser, offer.seedId, net);

    delete directOffers[offerId];
    console.log(`🏪 Offre directe acceptée : ${offer.fromUser} → ${offer.toUser} ${offer.seedName} ×${offer.qty}`);
  });

  socket.on('direct_offer_decline', ({ offerId }) => {
    const sess = sessions[socket.id];
    if(!sess) return;
    const offer = directOffers[offerId];
    if(!offer || offer.status !== 'pending') return;
    if(offer.toUser !== sess.username) return;
    offer.status = 'declined';
    // Refund seller stock
    const sellerSess = getSocketByUsername(offer.fromUser);
    if(sellerSess) {
      const sellerState = playerStates[sellerSess.playerId];
      if(sellerState) {
        if(!sellerState.harvested[offer.seedId]) sellerState.harvested[offer.seedId] = { qty: 0 };
        sellerState.harvested[offer.seedId].qty += offer.qty;
        logState(sellerState, `🏪 Offre refusée par ${offer.toUser} — ${offer.seedIco} ${offer.seedName} ×${offer.qty} rendu`, 'neg');
        persistPlayerState(sellerSess.playerId, offer.fromUser, sellerState);
        io.to(sellerSess.socketId).emit('state_update', { state: sellerState });
        io.to(sellerSess.socketId).emit('direct_offer_declined', { offerId });
      }
    }
    socket.emit('direct_offer_declined', { offerId });
    delete directOffers[offerId];
  });

  socket.on('direct_offer_cancel', ({ offerId }) => {
    const sess = sessions[socket.id];
    if(!sess) return;
    const offer = directOffers[offerId];
    if(!offer || offer.fromUser !== sess.username) return;
    if(offer.status !== 'pending') return;
    offer.status = 'cancelled';
    // Refund seller
    const state = playerStates[sess.playerId];
    if(state) {
      if(!state.harvested[offer.seedId]) state.harvested[offer.seedId] = { qty: 0 };
      state.harvested[offer.seedId].qty += offer.qty;
      persistPlayerState(sess.playerId, sess.username, state);
      socket.emit('state_update', { state });
    }
    delete directOffers[offerId];
    socket.emit('direct_offer_cancelled', { offerId });
    // Notify recipient
    const targetSess = getSocketByUsername(offer.toUser);
    if(targetSess) io.to(targetSess.socketId).emit('direct_offer_cancelled', { offerId });
  });

  socket.on('get_direct_offers', () => {
    const sess = sessions[socket.id];
    if(!sess) return;
    const myOffers = Object.values(directOffers).filter(o =>
      (o.fromUser === sess.username || o.toUser === sess.username) && o.status === 'pending'
    );
    socket.emit('direct_offers_list', myOffers);
  });

  // ================================================================
  //  MODÉRATION
  // ================================================================

  // Vérifie le rôle du joueur connecté et lui envoie mod_role_update
  socket.on('mod_get_role', async () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    try {
      const rows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
      const role = (rows && rows[0] && rows[0].role) ? rows[0].role : 'player';
      const isMod   = role === 'mod' || role === 'admin';
      const isOwner = role === 'admin';
      socket.emit('mod_role_update', { isMod, isOwner, role });
      console.log(`🛡️ mod_get_role → ${sess.username} : role=${role}`);
    } catch(e) {
      console.error('mod_get_role error:', e);
      socket.emit('mod_role_update', { isMod: false, isOwner: false, role: 'player' });
    }
  });

  // Renvoie la liste des modérateurs actifs
  socket.on('mod_list', async () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    try {
      const rows = await sbFetch(`players?role=in.(mod,admin)&select=username,role`);
      const moderators = (rows || []).filter(r => r.role === 'mod').map(r => r.username);
      const owners     = (rows || []).filter(r => r.role === 'admin').map(r => r.username);
      socket.emit('mod_list', { moderators, owners });
    } catch(e) {
      console.error('mod_list error:', e);
      socket.emit('mod_list', { moderators: [], owners: [] });
    }
  });

  // Supprimer un message du chat
  socket.on('mod_delete_message', async ({ ts }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const myRows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
    const myRole = (myRows && myRows[0]) ? myRows[0].role : 'player';
    if (myRole !== 'mod' && myRole !== 'admin') return socket.emit('mod_error', 'Permission refusée.');
    const idx = globalChatHistory.findIndex(m => m.ts === ts);
    if (idx !== -1) globalChatHistory.splice(idx, 1);
    io.emit('chat_message_deleted', { ts });
    console.log(`🗑️ Message supprimé par ${sess.username} (ts=${ts})`);
  });

  // Nommer un modérateur
  socket.on('mod_grant', async ({ username: targetUser }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const myRows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
    const myRole = (myRows && myRows[0]) ? myRows[0].role : 'player';
    if (myRole !== 'admin') return socket.emit('mod_error', 'Permission refusée.');
    await sbFetch(`players?username=eq.${encodeURIComponent(targetUser)}`, 'PATCH', { role: 'mod' });
    const targetSess = getSocketByUsername(targetUser);
    if (targetSess) io.to(targetSess.socketId).emit('mod_role_update', { isMod: true, isOwner: false, role: 'mod' });
    socket.emit('mod_ok', { msg: targetUser + ' est maintenant modérateur.', action: 'grant' });
    console.log(`🛡️ ${sess.username} a nommé ${targetUser} modérateur`);
  });

  // Révoquer un modérateur
  socket.on('mod_revoke', async ({ username: targetUser }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const myRows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
    const myRole = (myRows && myRows[0]) ? myRows[0].role : 'player';
    if (myRole !== 'admin') return socket.emit('mod_error', 'Permission refusée.');
    await sbFetch(`players?username=eq.${encodeURIComponent(targetUser)}`, 'PATCH', { role: 'player' });
    const targetSess = getSocketByUsername(targetUser);
    if (targetSess) io.to(targetSess.socketId).emit('mod_role_update', { isMod: false, isOwner: false, role: 'player' });
    socket.emit('mod_ok', { msg: targetUser + " n'est plus modérateur.", action: 'revoke' });
    console.log(`🛡️ ${sess.username} a révoqué ${targetUser}`);
  });

  // Kick (déconnecte) un joueur
  socket.on('mod_kick', async ({ username: targetUser, reason }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const myRows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
    const myRole = (myRows && myRows[0]) ? myRows[0].role : 'player';
    if (myRole !== 'mod' && myRole !== 'admin') return socket.emit('mod_error', 'Permission refusée.');
    const targetSess = getSocketByUsername(targetUser);
    if (!targetSess) return socket.emit('mod_error', 'Joueur introuvable ou hors-ligne.');
    io.to(targetSess.socketId).emit('kicked', { reason: reason || 'Expulsé par un modérateur.' });
    // Courte pause puis forcer la déconnexion
    setTimeout(() => {
      const s = io.sockets.sockets.get(targetSess.socketId);
      if (s) s.disconnect(true);
    }, 500);
    console.log(`🚫 ${sess.username} a kické ${targetUser} (${reason || '-'})`);
  });

  // Donner / retirer de l'argent à un joueur
  socket.on('mod_give_money', async ({ username: targetUser, amount }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const myRows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
    const myRole = (myRows && myRows[0]) ? myRows[0].role : 'player';
    if (myRole !== 'mod' && myRole !== 'admin') return socket.emit('mod_error', 'Permission refusée.');
    const amt = parseFloat(amount);
    if (isNaN(amt)) return socket.emit('mod_error', 'Montant invalide.');
    const targetSess = getSocketByUsername(targetUser);
    const targetState = targetSess ? playerStates[targetSess.playerId] : null;
    if (!targetState) {
      // Joueur hors-ligne : modifier en base directement
      const rows = await sbFetch(`players?username=eq.${encodeURIComponent(targetUser)}&select=id,save_data`);
      if (!rows || !rows[0]) return socket.emit('mod_error', 'Joueur introuvable.');
      const sd = rows[0].save_data || {};
      sd.wallet = f4((sd.wallet || 0) + amt);
      await sbFetch(`players?username=eq.${encodeURIComponent(targetUser)}`, 'PATCH', { save_data: sd });
      socket.emit('mod_ok', { msg: `${amt >= 0 ? '+' : ''}${amt} USDC appliqué à ${targetUser} (hors-ligne). Nouveau solde : ${f4(sd.wallet)} USDC`, action: 'give_money' });
    } else {
      targetState.wallet = f4((targetState.wallet || 0) + amt);
      if (targetState.wallet < 0) targetState.wallet = 0;
      logState(targetState, `💰 ${amt >= 0 ? '+' : ''}${f4(amt)} USDC par modérateur (${sess.username})`, amt >= 0 ? 'ok' : 'neg');
      persistPlayerState(targetSess.playerId, targetUser, targetState);
      io.to(targetSess.socketId).emit('state_update', { state: targetState });
      io.to(targetSess.socketId).emit('server_toast', { msg: `💰 Un modérateur vous a ${amt >= 0 ? 'donné' : 'retiré'} ${Math.abs(amt)} USDC` });
      socket.emit('mod_ok', { msg: `${amt >= 0 ? '+' : ''}${amt} USDC appliqué à ${targetUser}. Nouveau solde : ${f4(targetState.wallet)} USDC`, action: 'give_money' });
    }
    console.log(`💰 ${sess.username} a appliqué ${amt} USDC à ${targetUser}`);
  });

  // Donner une graine à un joueur
  socket.on('mod_give_seed', async ({ username: targetUser, seedId, qty }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const myRows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
    const myRole = (myRows && myRows[0]) ? myRows[0].role : 'player';
    if (myRole !== 'mod' && myRole !== 'admin') return socket.emit('mod_error', 'Permission refusée.');
    const q = Math.max(1, Math.min(99, parseInt(qty) || 1));
    // Trouver la graine dans toutes les listes
    const seed = findAnySeed(seedId);
    if (!seed) return socket.emit('mod_error', `Graine inconnue : ${seedId}`);
    const isExcl = !!AUCTION_EXCLUSIVE_SEEDS.find(s => s.id === seedId);
    const isMut  = !!MUTATION_SEEDS.find(s => s.id === seedId);
    const targetSess = getSocketByUsername(targetUser);
    const targetState = targetSess ? playerStates[targetSess.playerId] : null;
    if (!targetState) {
      // Hors-ligne : modifier en base
      const rows = await sbFetch(`players?username=eq.${encodeURIComponent(targetUser)}&select=id,save_data`);
      if (!rows || !rows[0]) return socket.emit('mod_error', 'Joueur introuvable.');
      const sd = rows[0].save_data || {};
      if (isExcl || isMut) {
        if (!sd.harvested) sd.harvested = {};
        if (!sd.harvested[seedId]) sd.harvested[seedId] = { qty: 0, ico: seed.ico, nm: seed.nm, bv: seed.bv };
        sd.harvested[seedId].qty += q;
      } else {
        if (!sd.seedsInv) sd.seedsInv = {};
        sd.seedsInv[seedId] = (sd.seedsInv[seedId] || 0) + q;
      }
      await sbFetch(`players?username=eq.${encodeURIComponent(targetUser)}`, 'PATCH', { save_data: sd });
      socket.emit('mod_ok', { msg: `${seed.ico} ${seed.nm} ×${q} donné à ${targetUser} (hors-ligne)`, action: 'give_seed' });
    } else {
      if (isExcl || isMut) {
        if (!targetState.harvested) targetState.harvested = {};
        if (!targetState.harvested[seedId]) targetState.harvested[seedId] = { qty: 0, ico: seed.ico, nm: seed.nm, bv: seed.bv };
        targetState.harvested[seedId].qty += q;
      } else {
        if (!targetState.seedsInv) targetState.seedsInv = {};
        targetState.seedsInv[seedId] = (targetState.seedsInv[seedId] || 0) + q;
      }
      logState(targetState, `🎁 ${seed.ico} ${seed.nm} ×${q} reçu par modérateur (${sess.username})`, 'ok');
      persistPlayerState(targetSess.playerId, targetUser, targetState);
      io.to(targetSess.socketId).emit('state_update', { state: targetState });
      io.to(targetSess.socketId).emit('server_toast', { msg: `🎁 Un modérateur vous a donné ${seed.ico} ${seed.nm} ×${q} !` });
      socket.emit('mod_ok', { msg: `${seed.ico} ${seed.nm} ×${q} donné à ${targetUser} (en ligne)`, action: 'give_seed' });
    }
    console.log(`🎁 ${sess.username} a donné ${seed.nm} ×${q} à ${targetUser}`);
  });

  // Supprimer un compte
  socket.on('mod_delete_account', async ({ username: targetUser }) => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const myRows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
    const myRole = (myRows && myRows[0]) ? myRows[0].role : 'player';
    if (myRole !== 'admin') return socket.emit('mod_error', 'Seul un owner peut supprimer un compte.');
    if (targetUser === sess.username) return socket.emit('mod_error', 'Impossible de supprimer votre propre compte.');
    const targetSess = getSocketByUsername(targetUser);
    if (targetSess) {
      io.to(targetSess.socketId).emit('account_deleted', { reason: 'Votre compte a été supprimé par un administrateur.' });
      setTimeout(() => { const s = io.sockets.sockets.get(targetSess.socketId); if (s) s.disconnect(true); }, 500);
    }
    await sbFetch(`players?username=eq.${encodeURIComponent(targetUser)}`, 'DELETE');
    socket.emit('mod_ok', { msg: `Compte de ${targetUser} supprimé définitivement.`, action: 'delete' });
    console.log(`🗑️ ${sess.username} a supprimé le compte de ${targetUser}`);
  });

  // Vider le chat global
  socket.on('mod_clear_chat', async () => {
    const sess = sessions[socket.id];
    if (!sess) return;
    const myRows = await sbFetch(`players?username=eq.${encodeURIComponent(sess.username)}&select=role`);
    const myRole = (myRows && myRows[0]) ? myRows[0].role : 'player';
    if (myRole !== 'mod' && myRole !== 'admin') return socket.emit('mod_error', 'Permission refusée.');
    globalChatHistory.length = 0;
    io.emit('chat_cleared');
    console.log(`🧹 Chat vidé par ${sess.username}`);
  });
});

// Track market war revenue when sell happens
function trackMarketWarRevenue(username, cropId, revenue) {
  const myFarm = Object.values(coopFarms).find(f => f.members.includes(username));
  if(!myFarm) return;
  Object.values(marketWars).forEach(war => {
    if(war.status !== 'active') return;
    if(war.cropId !== cropId) return;
    if(war.coop1Id === myFarm.id) {
      war.coop1Revenue = f4((war.coop1Revenue || 0) + revenue);
      io.emit('market_war_update', war);
    } else if(war.coop2Id === myFarm.id) {
      war.coop2Revenue = f4((war.coop2Revenue || 0) + revenue);
      io.emit('market_war_update', war);
    }
  });
}

// Helper: broadcast toast to all connected clients
function toast_broadcast(msg) {
  io.emit('server_toast', { msg });
}

// Hook into existing sell handler to track market war revenue
// We patch the sell event to also call trackMarketWarRevenue
// This is done by wrapping the sell handler broadcast
const _origSellBroadcast = io.emit.bind(io);

// ================================================================
//  DÉMARRAGE
// ================================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('==============================================');
  console.log(' TerraCapital - Serveur demarre !');
  console.log(' URL locale  : http://localhost:' + PORT);
  console.log(' Health      : http://localhost:' + PORT + '/health');
  console.log('==============================================');
  console.log('');
  // Verifier que index.html est accessible
  const fs = require('fs');
  const pub = require('path').join(__dirname, 'public', 'index.html');
  const root = require('path').join(__dirname, 'index.html');
  if (fs.existsSync(pub))  console.log('[OK] index.html trouve dans /public/');
  else if (fs.existsSync(root)) console.log('[OK] index.html trouve a la racine');
  else console.log('[ATTENTION] index.html introuvable ! Copiez-le dans /public/ ou a la racine.');
});

// ===== GESTION PROPRE DES SIGNAUX (Railway / Docker) =====

// Erreurs JS non catchées → log mais NE PAS crasher
process.on('uncaughtException', (err) => {
  console.error('[ERREUR NON CATCHEE]', err.message || err);
  // Ne pas process.exit() — on garde le serveur vivant
});

process.on('unhandledRejection', (reason) => {
  console.error('[PROMESSE REJETEE]', reason);
  // Ne pas process.exit() — on garde le serveur vivant
});

// SIGTERM : Railway envoie ce signal avant de stopper le container
// On ferme proprement les connexions au lieu de mourir brutalement
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Arrêt propre demandé par Railway...');
  server.close(() => {
    console.log('[SIGTERM] Serveur HTTP fermé proprement.');
    process.exit(0);
  });
  // Forcer la fermeture après 10s si les connexions ne se ferment pas
  setTimeout(() => {
    console.log('[SIGTERM] Timeout — arrêt forcé.');
    process.exit(0);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('[SIGINT] Arrêt manuel...');
  server.close(() => process.exit(0));
});

// Keep-alive : empêche Node de quitter si la boucle event est vide
// (ne devrait pas arriver mais Railway peut avoir des comportements inattendus)
setInterval(() => {}, 1 << 30);
