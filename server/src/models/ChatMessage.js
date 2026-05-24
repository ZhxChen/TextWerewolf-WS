import mongoose from 'mongoose'

const chatMessageSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  gameId: { type: String, required: true },
  sender: { type: String, required: true },
  senderPosition: { type: Number },
  senderRole: { type: String },
  channel: { type: String, required: true }, // 'public' | 'wolf'
  content: { type: String, required: true }
}, { timestamps: true, collection: 'chat_messages' })

export default mongoose.model('ChatMessage', chatMessageSchema)
