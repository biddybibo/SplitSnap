/**
 * Landing page — a STATIC page.
 *
 * It lives at the top level of src/pages/ (not under (app)/), so it renders
 * with no DeepSpace providers: no auth session fetch, no records WebSocket.
 * That makes it cheap to serve and safe for logged-out / crawler traffic.
 *
 * Need live data or auth here? Move this file to src/pages/(app)/index.tsx
 * and it becomes a dynamic page. Conversely, any page you want to keep static
 * (marketing, docs, legal) belongs at this top level.
 *
 * Top-level pages are also prerendered to static HTML at build
 * (prerender.ts, via vite.config.ts) so crawlers read real content.
 * Keep them renderable without a browser: no window/document during render,
 * prose in HTML text, reveal animations in CSS keyframes rather than JS-driven
 * initial states. `<Seo>` comes first and reads src/seo.ts.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { seo } from '../seo'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div
        data-testid="static-landing"
        className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      >
        <p className="mb-3 font-display text-lg font-bold tracking-tight text-foreground">{APP_NAME}</p>
        <h1 className="mb-4 max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
          Snap it. Share it. Everyone picks their own.
        </h1>
        <p className="mb-8 max-w-md text-muted-foreground">
          No more passing one phone around the table. Photograph the receipt, everyone
          taps what they had on their own phone, and each person gets an exact amount
          with a Venmo, Cash App or PayPal link.
        </p>
        <Link
          to="/home"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Start a bill
        </Link>
      </div>
    </>
  )
}
