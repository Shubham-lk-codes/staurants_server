import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import { User, Table, MenuItem } from './models.js'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/restaurant'

async function run() {
  await mongoose.connect(MONGO_URI)
  console.log('Connected to MongoDB')

  // Admin user
  const email = 'admin@restaurant.com'
  const password = 'admin123'
  const passwordHash = await bcrypt.hash(password, 10)
  await User.findOneAndUpdate(
    { email },
    { email, passwordHash, role: 'admin' },
    { upsert: true, new: true }
  )
  console.log('Admin user ensured:', email, password)

  // Table
  const table1 = await Table.findOneAndUpdate(
    { number: '1' },
    { number: '1', token: uuidv4(), isActive: true },
    { upsert: true, new: true }
  )
  console.log('Table ensured:', table1.number, table1.token)

  // Menu items
  const samples = [
    { name: 'Tomato Soup', category: 'Starters', price: 120, description: 'Classic soup', isAvailable: true },
    { name: 'Paneer Tikka', category: 'Starters', price: 240, description: 'Marinated paneer', isAvailable: true },
    { name: 'Butter Chicken', category: 'Main Course', price: 380, description: 'Creamy gravy', isAvailable: true },
    { name: 'Veg Biryani', category: 'Main Course', price: 320, description: 'Aromatic rice', isAvailable: true },
    { name: 'Masala Soda', category: 'Drinks', price: 90, description: 'Refreshing', isAvailable: true },
    { name: 'Gulab Jamun', category: 'Desserts', price: 110, description: 'Sweet delight', isAvailable: true },
  ]
  for (const s of samples) {
    await MenuItem.findOneAndUpdate(
      { name: s.name },
      s,
      { upsert: true }
    )
  }
  console.log('Sample menu items ensured')

  await mongoose.disconnect()
  console.log('Done.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})


