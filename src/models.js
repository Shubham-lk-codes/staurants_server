import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff'], default: 'staff' }
}, { timestamps: true })

const TableSchema = new mongoose.Schema({
  number: { type: Number, required: true },
  token: { type: String, unique: true, default: uuidv4 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true })

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  imageUrl: String,
  category: { type: String, enum: ['Starters', 'Main Course', 'Drinks', 'Desserts'], index: true },
  price: { type: Number, required: true },
  isAvailable: { type: Boolean, default: true },
  prepMinutes: { type: Number, default: 15 }
}, { timestamps: true })

const OrderItemSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  quantity: { type: Number, required: true, min: 1 }
}, { _id: false })

const OrderSchema = new mongoose.Schema({
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
  items: [OrderItemSchema],
  status: { type: String, enum: ['pending', 'preparing', 'ready', 'served', 'paid'], default: 'pending', index: true },
  totalAmount: { type: Number, default: 0 },
  paid: { type: Boolean, default: false }
}, { timestamps: true })

export const User = mongoose.model('User', UserSchema)
export const Table = mongoose.model('Table', TableSchema)
export const MenuItem = mongoose.model('MenuItem', MenuItemSchema)
export const Order = mongoose.model('Order', OrderSchema)


