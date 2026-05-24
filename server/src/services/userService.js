import { User } from '../models/index.js'

export async function getUserByUsername(username) {
  return User.findOne({ username })
}

export async function updateUser(username, data) {
  return User.findOneAndUpdate({ username }, data, { new: true })
}
