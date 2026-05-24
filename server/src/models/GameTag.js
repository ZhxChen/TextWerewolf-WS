import mongoose from 'mongoose'

const gameTagSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  gameId: { type: String, required: true },
  day: { type: Number, required: true, default: 1 },
  stage: { type: Number, required: true, default: 0 },
  target: { type: String },
  name: { type: String },
  position: { type: Number },
  dayStatus: { type: Number },
  desc: { type: String },
  mode: { type: Number, required: true },
  value: { type: String },
  value2: { type: Array },
  value3: { type: mongoose.Schema.Types.Mixed },
  data: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true, collection: 'game_tags' })

export default mongoose.model('GameTag', gameTagSchema)
