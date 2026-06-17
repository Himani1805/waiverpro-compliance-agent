import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import complianceRouter from './src/routes/complianceRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json());

if (!MONGO_URI) {
  console.error('[ERROR] MONGO_URI is not defined in your .env file. Exiting.');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('[DATABASE] Connected to MongoDB.'))
  .catch((err) => {
    console.error(`[DATABASE] Connection failed: ${err.message}`);
    process.exit(1);
  });

// Log MongoDB errors after startup.
mongoose.connection.on('error', (err) => {
  console.error(`[DATABASE] Runtime error: ${err.message}`);
});

app.use('/api/compliance', complianceRouter);

// Health check.
app.get('/api/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(500).json({ error: 'InternalServerError', message: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`[+] Server running at: http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] Port ${PORT} is already in use. Set a different PORT in .env.`);
  } else {
    console.error(`[ERROR] Server failed to start: ${err.message}`);
  }
  process.exit(1);
});
