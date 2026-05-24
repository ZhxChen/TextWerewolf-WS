import mongoose from 'mongoose'

const playerSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  gameId: { type: String, required: true },
  userId: { type: String },
  username: { type: String, required: true },
  name: { type: String },
  role: { type: String, required: true },
  roleName: { type: String },
  camp: { type: Number, default: -1 },
  campName: { type: String },
  status: { type: Number, default: 1 },
  outReason: { type: String },
  position: { type: Number, required: true },
  skill: { type: Array, default: [] },
  remark: { type: String }
}, { timestamps: true, collection: 'players' })

playerSchema.index({ gameId: 1, roomId: 1 })
playerSchema.index({ username: 1 })

export default mongoose.model('Player', playerSchema)
