#!/usr/bin/env node
/**
 * Seed script: creates default admin/test users in MongoDB.
 * Usage: node server/scripts/seed.js  (from werewolf/ root)
 *    or: node scripts/seed.js          (from werewolf/server/)
 */
import mongoose from 'mongoose'
import config from '../src/config/index.js'
import { createPassword } from '../src/utils/helper.js'

const UserSchema = new mongoose.Schema({
  username: String,
  password: String,
  name: String,
  role: { type: String, default: 'user' },
  status: { type: Number, default: 1 }
}, { collection: 'users' })

const User = mongoose.models.User || mongoose.model('User', UserSchema)

async function seed() {
  await mongoose.connect(config.mongodb.uri)
  console.log('Connected to MongoDB')

  const users = [
    { username: 'admin', plainPassword: '123456', name: '管理员', role: 'admin' },
    { username: 'test1', plainPassword: '123456', name: '玩家1', role: 'user' },
    { username: 'test2', plainPassword: '123456', name: '玩家2', role: 'user' },
    { username: 'test3', plainPassword: '123456', name: '玩家3', role: 'user' },
  ]

  for (const { plainPassword, ...user } of users) {
    const exists = await User.findOne({ username: user.username })
    if (!exists) {
      await User.create({ ...user, password: await createPassword(plainPassword) })
      console.log(`Created user: ${user.username}`)
    } else {
      console.log(`User already exists: ${user.username}`)
    }
  }

  await mongoose.disconnect()
  console.log('Done')
}

seed().catch((err) => { console.error(err); process.exit(1) })
