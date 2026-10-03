/**
 * Avatar colors from the mockup palette, picked deterministically from a user id
 * so a person keeps one color on every phone. All pass 4.5:1 with white initials.
 */
export const AVATAR_COLORS = ['#1F5FD1', '#8A3FB8', '#1F7A4D', '#B54708', '#0E7490', '#BE185D']

export function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
