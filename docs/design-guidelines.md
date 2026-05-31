# Design Guidelines

## Product Tone

Corgi7 is an operational booking tool, so the interface should stay quiet, direct, and fast to scan. Prefer clear state, compact controls, and predictable navigation over decorative presentation.

## Layout

- Put the active workflow first. Avoid landing-page patterns inside the app.
- Keep admin surfaces dense but readable, with tables, filters, and action bars close to the data they affect.
- Use stable dimensions for calendars, slots, counters, and buttons so state changes do not shift the layout.
- Keep cards for repeated records, dialogs, and genuinely framed tools. Avoid nested cards.

## Interaction

- Use explicit disabled states when enrollment is closed, deadlines have passed, slots are full, or choices conflict.
- Prefer inline status and toast-style feedback over native browser alerts.
- Buttons should describe actions. Icon-only buttons need `aria-label`.
- Destructive or broad admin operations should be visibly distinct from routine edits.

## Content

- Keep Vietnamese messages short, specific, and actionable.
- Use the configured assessment name where user-facing copy refers to the event.
- Do not expose internal implementation details in UI messages.

## Accessibility

- Preserve keyboard access for forms, tabs, and calendar choices.
- Use `aria-live` only for state changes that users need to hear immediately.
- Ensure color is never the only signal for selected, full, conflict, or disabled slot states.
