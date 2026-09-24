import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  // CORS — allow Lua panel to call from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ status: false, msg: 'method not allowed' });

  const { key, device } = req.query;

  if (!key) {
    return res.status(400).json({ status: false, msg: 'missing key' });
  }

  try {
    // Find the key document
    const snap = await db.collection('keys').where('key', '==', key).limit(1).get();

    if (snap.empty) {
      return res.json({ status: false, msg: 'invalid key' });
    }

    const doc = snap.docs[0];
    const k = doc.data();

    // Check enabled
    if (!k.enabled) {
      return res.json({ status: false, msg: 'key disabled' });
    }

    // Check expiry
    const exp = k.expiresAt?.toDate ? k.expiresAt.toDate() : new Date(k.expiresAt);
    if (exp && exp.getTime() < Date.now()) {
      return res.json({
        status: false,
        msg: 'key expired',
        expires: exp.toISOString().split('T')[0],
      });
    }

    // Device binding
    if (device) {
      const devices = k.devices || [];
      if (devices.includes(device)) {
        // Already bound — pass
      } else if (devices.length < (k.maxDevices || 1)) {
        // Room for one more device — bind it
        await doc.ref.update({ devices: [...devices, device] });
      } else {
        return res.json({ status: false, msg: 'device limit reached' });
      }
    }

    // All checks passed
    return res.json({
      status: true,
      tier: k.tier || 'pro',
      expires: exp ? exp.toISOString().split('T')[0] : null,
      devices: (k.devices || []).length,
      maxDevices: k.maxDevices || 1,
      msg: 'valid',
    });

  } catch (e) {
    console.error('[kuro-check] error:', e);
    return res.status(500).json({
      status: false,
      msg: 'server error: ' + e.message,
    });
  }
}
