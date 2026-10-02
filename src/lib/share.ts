/**
 * Opens the phone's share sheet with a bill link, or copies it where there's no
 * share sheet. Returns 'shared' | 'copied' | 'cancelled'; throws on real failure.
 */
export async function shareBillLink(billId: string, merchant: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = `${window.location.origin}/b/${billId}`
  const text = `Split ${merchant} with me on SplitSnap. Tap what you had.`
  if (navigator.share) {
    try {
      await navigator.share({ title: 'SplitSnap', text, url })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      throw err
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
