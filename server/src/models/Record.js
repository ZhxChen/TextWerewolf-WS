import mongoose from 'mongoose'

const recordSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  gameId: { type: String, required: true },
  view: { type: [String], default: [] },
  stage: { type: Number, default: 0 },
  day: { type: Number, default: 1 },
  isTitle: { type: Number, default: 0 },
  isCommon: { type: Number, default: 0 },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  remark: { type: String }
}, { timestamps: true, collection: 'records' })

export default mongoose.model('Record', recordSchema)
