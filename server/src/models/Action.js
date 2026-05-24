import mongoose from 'mongoose'

const actionSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  gameId: { type: String, required: true },
  day: { type: Number, required: true, default: 1 },
  stage: { type: Number, required: true, default: 0 },
  from: { type: String, required: true },
  to: { type: String, required: true },
  action: { type: String, required: true },
  remark: { type: String }
}, { timestamps: true, collection: 'actions' })

// Prevent duplicate skill submissions (concurrent protection)
actionSchema.index({ gameId: 1, day: 1, stage: 1, from: 1, action: 1 }, { unique: true })

export default mongoose.model('Action', actionSchema)
