import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  status: { type: Number, default: 1 },
  remark: { type: String }
}, { timestamps: true, collection: 'users' })

export default mongoose.model('User', userSchema)
