import express from 'express'
import http from 'http'
import cors from 'cors'
import mongoose from 'mongoose'
import { Server as SocketIOServer } from 'socket.io'
import { buildRouter } from './routes.js'

const app = express()
const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
})

app.use(cors({ origin: '*'}))
app.use(express.json())

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/restaurant'
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
