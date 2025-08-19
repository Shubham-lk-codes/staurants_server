import express from 'express'
import http from 'http'
import cors from 'cors'
import mongoose from 'mongoose'
import { Server as SocketIOServer } from 'socket.io'
import { buildRouter } from './routes.js'

import dotenv from "dotenv";
dotenv.config();

const app = express()
const server = http.createServer(app)

const FRONTEND_URL = process.env.PUBLIC_APP_URL || "http://localhost:5173";

const allowedOrigins = [
  "http://localhost:5173",   // local dev ke liye
  FRONTEND_URL               // Vercel ka frontend
];

// ✅ Express CORS config
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());

// ✅ Socket.io CORS config
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

const MONGO_URI = process.env.MONGO_URI
const PORT = process.env.PORT || 5000

mongoose.connect(MONGO_URI).then(() => {
  console.log('MongoDB connected')
}).catch((err) => {
  console.error('Mongo connection error', err)
})

io.on('connection', (socket) => {
  console.log('socket connected', socket.id)
})

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/api', buildRouter(io))

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`)
})
