/**
 * Avatar color index from a user id: a person keeps one color on every phone.
 * Shared by the app (people.ts) and the public preview route, which sends the
 * index instead of the id.
 */
export const AVATAR_COLOR_COUNT = 6

export function avatarIndex(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % AVATAR_COLOR_COUNT
}
