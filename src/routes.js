import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'qrcode'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { User, Table, MenuItem, Order } from './models.js'

export function buildRouter(io) {
  const router = express.Router()
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

  // Initialize Razorpay (ensure env vars are set)
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || ''
  })

  // Auth
  router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body
    const user = await User.findOne({ email })
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })
    const token = jwt.sign({ sub: user._id, role: user.role }, JWT_SECRET, { expiresIn: '12h' })
    res.json({ token })
  })

  function requireAuth(req, res, next) {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    try {
      if (!token) throw new Error('no token')
      req.user = jwt.verify(token, JWT_SECRET)
      next()
    } catch (e) {
      res.status(401).json({ message: 'Unauthorized' })
    }
  }

  // Menu
  router.get('/menu', async (req, res) => {
    const items = await MenuItem.find({ isAvailable: true }).lean()
    res.json(items)
  })

  // Orders
  router.post('/orders', async (req, res) => {
    try {
      const { tableToken, ordered_items } = req.body
      const table = await Table.findOne({ token: tableToken })
      if (!table) return res.status(400).json({ message: 'Invalid table' })

      const itemIds = ordered_items.map(o => o.itemId)
      const menuItems = await MenuItem.find({ _id: { $in: itemIds } })
      const idToItem = new Map(menuItems.map(m => [String(m._id), m]))

      const items = ordered_items.map(o => ({ item: o.itemId, quantity: o.quantity }))
      const totalAmount = ordered_items.reduce((sum, o) => sum + (idToItem.get(o.itemId)?.price || 0) * o.quantity, 0)

      const order = await Order.create({ table: table._id, items, totalAmount, status: 'pending' })
      const populated = await order.populate({ path: 'items.item' }).then(o => o.populate('table'))

      io.emit('order:new', populated)
      res.status(201).json(populated)
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Failed to create order' })
    }
  })

  router.get('/orders', requireAuth, async (req, res) => {
    const orders = await Order.find({ status: { $in: ['pending', 'preparing', 'ready'] } })
      .sort({ createdAt: 1 }).populate('table').populate('items.item').lean()
    res.json(orders)
  })

  router.put('/orders/:id/status', requireAuth, async (req, res) => {
    const { status } = req.body
    const allowed = ['pending', 'preparing', 'ready', 'served', 'paid']
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Bad status' })
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate('table').populate('items.item')
    if (!order) return res.status(404).json({ message: 'Not found' })
    io.emit('order:update', order)
    res.json(order)
  })

  router.post('/orders/:id/archive', requireAuth, async (req, res) => {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: 'served' }, { new: true })
    if (!order) return res.status(404).json({ message: 'Not found' })
    io.emit('order:archive', { id: order._id })
    res.json({ ok: true })
  })

  // Admin: tables and QR
  router.post('/admin/tables', requireAuth, async (req, res) => {
    const { number } = req.body
    const token = uuidv4()
    const table = await Table.create({ number, token })
    res.status(201).json(table)
  })

  router.get('/admin/tables/:id/qr', requireAuth, async (req, res) => {
    const table = await Table.findById(req.params.id)
    if (!table) return res.status(404).json({ message: 'Not found' })
    const url = `${process.env.PUBLIC_APP_URL || 'http://localhost:5173'}/menu?table=${table.token}`
    const dataUrl = await QRCode.toDataURL(url)
    res.json({ dataUrl, url })
  })

  // Step 1: Create payment order
  router.post('/orders/:id/pay', async (req, res) => {
    try {
      const orderDoc = await Order.findById(req.params.id)
      if (!orderDoc) return res.status(404).json({ message: 'Order not found' })

      const options = {
        amount: Math.round(orderDoc.totalAmount * 100), // in paise
        currency: 'INR',
        receipt: `order_rcpt_${orderDoc._id}`,
        payment_capture: 1
      }

      const paymentOrder = await razorpay.orders.create(options)
      res.json({
        key: process.env.RAZORPAY_KEY_ID,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        orderId: paymentOrder.id
      })
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to create payment' })
    }
  })

  // Step 2: Verify payment
  router.post('/payments/verify', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body
    try {
      const sign = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex')

      if (sign === razorpay_signature) {
        // Update order status
        await Order.findByIdAndUpdate(orderId, { status: 'paid' })
        io.emit('order:update', { _id: orderId, status: 'paid' })
        res.json({ success: true })
      } else {
        res.status(400).json({ success: false, message: 'Invalid signature' })
      }
    } catch (err) {
      console.error(err)
      res.status(500).json({ success: false })
    }
  })


  return router
}
