import mongoose from 'mongoose'
import { MODE } from '../config/constants.js'

const DEFAULT_MODE = 'standard_9'
const GAME_MODE = MODE[DEFAULT_MODE]

const gameSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  owner: { type: String, required: true },
  status: { type: Number, default: 0 },
  stage: { type: Number, default: -1 },
  stageStack: { type: [Number], default: [] },
  day: { type: Number, default: 1 },
  seats: { type: [String], default: [] },
  winner: { type: Number, default: -1 },
  winnerString: { type: String, default: '' },
  mode: { type: String, default: DEFAULT_MODE },
  playerCount: { type: Number, default: GAME_MODE.count },
  witchSaveSelf: { type: Number, default: GAME_MODE.CONFIG_DEFAULT.witchSaveSelf },
  winCondition: { type: Number, default: GAME_MODE.CONFIG_DEFAULT.winCondition },
  flatTicket: { type: Number, default: GAME_MODE.CONFIG_DEFAULT.flatTicket },
  predictorActionTime: { type: Number, default: GAME_MODE.CONFIG_DEFAULT.predictorActionTime },
  wolfActionTime: { type: Number, default: GAME_MODE.CONFIG_DEFAULT.wolfActionTime },
  witchActionTime: { type: Number, default: GAME_MODE.CONFIG_DEFAULT.witchActionTime },
  speakActionTime: { type: Number, default: 60 },
  voteActionTime: { type: Number, default: 30 },
  pkCandidates: { type: [String], default: [] },
  currentSpeakerPosition: { type: Number, default: -1 },
  speakStartPosition: { type: Number, default: -1 },
  speakOrderDirection: { type: Number, default: 1 },
  lastWordPlayers: { type: [Number], default: [] },
  lastWordContext: { type: String, default: '' },
  currentLastWordPosition: { type: Number, default: -1 },
  remark: { type: String }
}, { timestamps: true, collection: 'games' })

export default mongoose.model('Game', gameSchema)
