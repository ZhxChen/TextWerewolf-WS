import mongoose from 'mongoose'

const systemConfigSchema = new mongoose.Schema({
  registrationOpen: { type: Boolean, default: true },
}, { timestamps: true, collection: 'system_config' })

export default mongoose.model('SystemConfig', systemConfigSchema)
