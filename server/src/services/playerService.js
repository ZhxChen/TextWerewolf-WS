import { Player } from '../models/index.js'

export async function modifyPlayerSkill(player, skillKey, status) {
  const skill = player.skill.map((s) => (s.key === skillKey ? { ...s, status } : s))
  await Player.findByIdAndUpdate(player._id, { skill })
}
