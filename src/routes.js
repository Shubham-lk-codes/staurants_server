

import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'qrcode'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { User, Table, MenuItem, Order } from './models.js'
import cloudinary from './config/cloudinary.js'
// import upload from './middleware/upload.js'
import streamifier from "streamifier";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });


export function buildRouter(io) {
  const router = express.Router()
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

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

  // ✅ Get all items (for admin)
router.get('/menu/all', async (req, res) => {
  try {
    const items = await MenuItem.find().lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: "Error fetching menu items" });
  }
});


router.post("/menu", upload.single("image"), async (req, res) => {
  try {
    let imageUrl = "";

    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "menu_items" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });

      // console.log("Cloudinary Upload Result:", uploadResult);
      imageUrl = uploadResult.secure_url;
    }

    const menuItem = new MenuItem({
      name: req.body.name,
      description: req.body.description,
      imageUrl,
      category: req.body.category,
      price: Number(req.body.price),
      isAvailable: req.body.isAvailable === "true" || req.body.isAvailable === true,
      prepMinutes: Number(req.body.prepMinutes),
    });

    await menuItem.save();
    res.status(201).json(menuItem);
  } catch (error) {
    console.error("Error uploading menu item:", error);
    res.status(500).json({ message: "Error creating menu item" });
  }
});

router.put("/menu/:id", upload.single("image"), async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);
    if (!menuItem) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    // Agar nayi image aayi hai to upload karke update kar
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "menu_items" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      menuItem.imageUrl = result.secure_url;
    }

    // Baaki fields update karo
    menuItem.name = req.body.name || menuItem.name;
    menuItem.description = req.body.description || menuItem.description;
    menuItem.category = req.body.category || menuItem.category;
    menuItem.price = req.body.price || menuItem.price;
    menuItem.isAvailable =
      req.body.isAvailable !== undefined
        ? req.body.isAvailable
        : menuItem.isAvailable;
    menuItem.prepMinutes = req.body.prepMinutes || menuItem.prepMinutes;

    await menuItem.save();
    res.status(200).json(menuItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating menu item" });
  }
});




// ✅ Delete Menu Item
router.delete("/menu/:id", async (req, res) => {
  try {
    const deletedItem = await MenuItem.findByIdAndDelete(req.params.id);
    if (!deletedItem) return res.status(404).json({ message: "Item not found" });

    res.json({ message: "Menu item deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting menu item" });
  }
});

  // Create Order
  router.post('/orders', async (req, res) => {
    try {
      const { tableToken, ordered_items } = req.body
      const table = await Table.findOne({ token: tableToken })
      if (!table) return res.status(400).json({ message: 'Invalid table' })

      const itemIds = ordered_items.map(o => o.itemId)
      const menuItems = await MenuItem.find({ _id: { $in: itemIds } })
      const idToItem = new Map(menuItems.map(m => [String(m._id), m]))

      const items = ordered_items.map(o => ({ item: o.itemId, quantity: o.quantity }))
      const totalAmount = ordered_items.reduce(
        (sum, o) => sum + (idToItem.get(String(o.itemId))?.price || 0) * o.quantity,
        0
      )

      const order = await Order.create({ table: table._id, items, totalAmount, status: 'pending' })
      const populated = await order.populate({ path: 'items.item' }).then(o => o.populate('table'))

      io.emit('order:new', populated)
      res.status(201).json(populated)
    } catch (e) {
      console.error(e)
      res.status(500).json({ message: 'Failed to create order' })
    }
  })

  // Get Orders (with optional served/paid)
  router.get('/orders', requireAuth, async (req, res) => {
    try {
      const includeServed = req.query.includeServed === 'true'
      const statuses = includeServed
        ? ['pending', 'preparing', 'ready', 'served', 'paid']
        : ['pending', 'preparing', 'ready']

      const orders = await Order.find({ status: { $in: statuses } })
        .sort({ createdAt: 1 })
        .populate('table')
        .populate('items.item')
        .lean()

      res.json(orders)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to fetch orders' })
    }
  })

  // Update status
  router.put('/orders/:id/status', requireAuth, async (req, res) => {
    const { status } = req.body
    const allowed = ['pending', 'preparing', 'ready', 'served', 'paid']
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Bad status' })

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate('table')
      .populate('items.item')
    if (!order) return res.status(404).json({ message: 'Not found' })

    io.emit('order:update', order)
    res.json(order)
  })

  // Archive (set served) – emit update (NOT delete)
  router.post('/orders/:id/archive', requireAuth, async (req, res) => {
    const order = await Order.findByIdAndUpdate(req.params.id, { status: 'served' }, { new: true })
      .populate('table')
      .populate('items.item')
    if (!order) return res.status(404).json({ message: 'Not found' })

    // Emit full update so frontend just updates status
    io.emit('order:update', order)
    res.json({ ok: true })
  })

  // Admin: create table
  router.post('/admin/tables', requireAuth, async (req, res) => {
    const { number } = req.body
    const token = uuidv4()
    const table = await Table.create({ number, token })
    res.status(201).json(table)
  })

  // Admin: get tables
  router.get('/admin/tables', requireAuth, async (req, res) => {
    try {
      const tables = await Table.find().lean()
      res.json(tables)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to fetch tables' })
    }
  })

  // Admin: table QR
  router.get('/admin/tables/:id/qr', requireAuth, async (req, res) => {
    const table = await Table.findById(req.params.id)
    if (!table) return res.status(404).json({ message: 'Not found' })
    const url = `${process.env.PUBLIC_APP_URL || 'http://localhost:5173'}/menu?tableToken=${table.token}`
    const dataUrl = await QRCode.toDataURL(url)
    res.json({ dataUrl, url })
  })

  // Razorpay: Create payment order
  router.post('/orders/:id/pay', async (req, res) => {
    try {
      const orderDoc = await Order.findById(req.params.id)
      if (!orderDoc) return res.status(404).json({ message: 'Order not found' })

      const options = {
        amount: Math.round(orderDoc.totalAmount * 100),
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

  // Razorpay: Verify payment – emit full populated order
  router.post('/payments/verify', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body
    try {
      const sign = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex')

      if (sign !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Invalid signature' })
      }

      const updated = await Order.findByIdAndUpdate(orderId, { status: 'paid' }, { new: true })
        .populate('table')
        .populate('items.item')

      io.emit('order:update', updated)
      res.json({ success: true })
    } catch (err) {
      console.error(err)
      res.status(500).json({ success: false })
    }
  })

  return router
}
