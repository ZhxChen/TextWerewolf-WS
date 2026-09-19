import mongoose from 'mongoose'
import { MODE } from '../config/constants.js'

const DEFAULT_MODE = 'standard_9'

const roomSchema = new mongoose.Schema({
  name: { type: String, default: '狼人杀房间' },
  status: { type: Number, default: 0 },
  gameId: { type: String, default: null },
  password: { type: String, default: null },
  owner: { type: String, required: true },
  seats: { type: [String], default: [] },
  mode: { type: String, default: DEFAULT_MODE },
  count: { type: Number, default: MODE[DEFAULT_MODE].count },
  wait: { type: [String], default: [] },
  ob: { type: [String], default: [] },
  remark: { type: String },
  nightActionTime: { type: Number, default: 15 },
  speakActionTime: { type: Number, default: 60 },
  voteActionTime: { type: Number, default: 30 },
  chatRateLimit: { type: Boolean, default: true },
  lastActivityAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'rooms' })

roomSchema.index({ status: 1 })
roomSchema.index({ owner: 1 })

export default mongoose.model('Room', roomSchema)
