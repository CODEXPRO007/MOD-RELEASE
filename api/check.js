// api/check.js — Vercel serverless function
// Vercel dashboard me 3 env vars daalne hain:
//   FIREBASE_PROJECT_ID      = vipemote-e492e
//   FIREBASE_CLIENT_EMAIL    = (firebase service account email)
//   FIREBASE_PRIVATE_KEY     = (firebase service account private key)

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { key, device } = req.query;
  if (!key) return res.status(400).json({ status: false, msg: 'missing key' });

  try {
    const snap = await db.collection('keys').where('key', '==', key).limit(1).get();
    if (snap.empty) return res.json({ status: false, msg: 'invalid key' });

    const doc = snap.docs[0];
    const k = doc.data();

    if (!k.enabled) return res.json({ status: false, msg: 'disabled' });

    const exp = k.expiresAt?.toDate ? k.expiresAt.toDate() : new Date(k.expiresAt);
    if (exp && exp.getTime() < Date.now()) {
      return res.json({ status: false, msg: 'expired' });
    }

    if (device) {
      const devices = k.devices || [];
      if (!devices.includes(device)) {
        if (devices.length < (k.maxDevices || 1)) {
          await doc.ref.update({ devices: [...devices, device] });
        } else {
          return res.json({ status: false, msg: 'device limit reached' });
        }
      }
    }

    return res.json({
      status: true,
      tier: k.tier || 'pro',
      expires: exp ? exp.toISOString().split('T')[0] : null,
      msg: 'valid',
    });
  } catch (e) {
    return res.status(500).json({ status: false, msg: e.message });
  }
}
