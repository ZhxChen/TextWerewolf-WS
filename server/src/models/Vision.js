import mongoose from 'mongoose'

const visionSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  gameId: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  status: { type: Number, default: 1 },
  remark: { type: String }
}, { timestamps: true, collection: 'visions' })

export default mongoose.model('Vision', visionSchema)
