/**
 * MongoDB: No schema sync needed. Collections are created on first write.
 * This script just verifies connection. Use: npm run db:sync
 * Set MONGODB_URI or DB_URL in .env (e.g. mongodb://localhost:27017/kaspamemes)
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import * as dns from 'node:dns';

config({ path: resolve(__dirname, '../.env') });

const uri =
  process.env.MONGODB_URI?.trim() ||
  process.env.DB_URL?.trim() ||
  'mongodb://localhost:27017/kaspamemes';

async function run() {
  try {
    // `mongodb+srv://` requires SRV DNS resolution. Some environments break it.
    // If so, use reliable public resolvers (or override via env).
    if (uri.startsWith('mongodb+srv://')) {
      const override = process.env.MONGODB_DNS_SERVERS?.trim();
      const servers = override
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) ?? ['8.8.8.8', '1.1.1.1'];
      dns.setServers(servers);
    }

    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB not connected');
    await db.admin().ping();
    console.log(
      'MongoDB connection OK. Collections are created on first write.',
    );
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
}

run();
