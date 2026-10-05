/**
 * Avatar colors from the mockup palette, picked deterministically from a user id
 * so a person keeps one color on every phone. All pass 4.5:1 with white initials.
 */
import { AVATAR_COLOR_COUNT, avatarIndex } from '../shared/avatar'

export const AVATAR_COLORS = ['#1F5FD1', '#8A3FB8', '#1F7A4D', '#B54708', '#0E7490', '#BE185D']
if (AVATAR_COLORS.length !== AVATAR_COLOR_COUNT) throw new Error('AVATAR_COLORS must match AVATAR_COLOR_COUNT')

export function avatarColor(id: string): string {
  return AVATAR_COLORS[avatarIndex(id)]
}

export function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
