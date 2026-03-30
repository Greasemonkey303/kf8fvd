# Frontend Hardening Checklist

Use this as the follow-up production checklist for UI, UX, performance, accessibility, and admin front-end cleanup.

Time estimates assume one developer doing a focused pass in this repo. They are rough planning estimates, not guarantees.

## Effort Summary

- Easy: about 4.5 to 9 developer-days total.
- Medium: about 4.5 to 9 developer-days total.
- Hard: about 4 to 8 developer-days total.
- Full frontend checklist: about 13 to 26 developer-days total.

## Easy

### 1. Finish Removing Admin Inline Styles

Estimated time: about 0.5 to 1 day.

- [x] Replace remaining inline `style={...}` usage across admin pages with CSS modules or shared classes.
- [x] Re-tighten admin CSP after inline style cleanup is complete.
- [x] Verify the admin area still renders correctly after CSP is tightened again.

### 2. Standardize Admin Data Fetching

Estimated time: about 0.5 to 1 day.

- [x] Confirm all client-side admin fetches use the same-origin `/admin/*` or `/admin/api/*` pattern.
- [x] Remove any remaining browser calls to `/api/admin/*` that could be intercepted by Cloudflare Access.
- [x] Keep admin link prefetch behavior intentional so background fetch noise does not return.

### 3. Improve Loading States

Estimated time: about 0.5 to 1 day.

- [x] Standardize loading indicators across admin and public pages.
- [x] Replace ad hoc spinners/placeholders with a consistent loading pattern.
- [x] Verify all long-running actions visibly show in-progress state.

### 4. Tighten Form UX

Estimated time: about 1 to 2 days.

- [x] Standardize validation messages across sign-in, contact, reset-password, and admin forms.
- [x] Make button disabled states, busy states, and success states consistent.
- [x] Ensure all destructive actions use clear confirmation UI.

### 5. Improve Error States

Estimated time: about 1 to 2 days.

- [x] Add consistent error UI for failed fetches, uploads, and save actions.
- [x] Make admin screens show actionable retry states instead of silent failures.
- [x] Ensure public pages degrade cleanly when API data is temporarily unavailable.

### 6. Improve Image Handling

Estimated time: about 1 to 2 days.

- [x] Audit image rendering paths for public and admin pages.
- [x] Standardize object-fit, preview, thumbnail, and fallback behavior.
- [x] Confirm uploaded MinIO-backed images always resolve through the intended proxy/public path.

## Medium

### 7. Improve Mobile Layout Quality

Estimated time: about 1 to 2 days.

- [x] Test every main public page on mobile widths.
- [x] Test the admin area on tablet/mobile widths for overflow and layout breakage.
- [x] Fix cramped controls, overflowing tables, and modal sizing issues.

### 8. Improve Performance Hygiene

Estimated time: about 1 to 2 days.

- [x] Audit unused preloads, duplicate scripts, and heavy client-side effects.
- [x] Reduce unnecessary client re-renders and repeated fetches.
- [x] Verify image loading, lazy loading, and route transitions remain smooth.

### 9. Add Frontend Error Monitoring

Estimated time: about 1 to 2 days.

- [x] Add a lightweight strategy for capturing client-side runtime errors.
- [x] Track failed fetches and repeated UI errors in a structured way.
- [x] Decide whether browser console-only debugging is sufficient long term.

### 10. Improve Accessibility

Estimated time: about 1.5 to 3 days.

- [x] Audit keyboard navigation across public and admin pages.
- [x] Verify labels, aria relationships, focus order, and focus restoration on dialogs.
- [x] Check contrast, visible focus states, and screen-reader feedback for status/error messages.

## Hard

### 11. Add Frontend Test Coverage

Estimated time: about 2 to 4 days.

- [x] Add Playwright coverage for key public flows.
- [x] Add Playwright coverage for admin login, content edits, and delete flows.
- [x] Add regression coverage for Cloudflare Access-sensitive admin navigation.

### 12. Create A Shared UI System Pass

Estimated time: about 2 to 4 days.

- [x] Standardize shared button, input, table, modal, badge, and status styles.
- [x] Reduce one-off page-specific UI patterns where they create maintenance burden.
- [x] Keep public and admin interfaces visually consistent without overcomplicating the code.

## Suggested Execution Order

- [x] 1. Finish removing admin inline styles. Estimated time: 0.5 to 1 day.
- [x] 2. Standardize admin data fetching. Estimated time: 0.5 to 1 day.
- [x] 3. Improve loading states. Estimated time: 0.5 to 1 day.
- [x] 4. Tighten form UX. Estimated time: 1 to 2 days.
- [x] 5. Improve error states. Estimated time: 1 to 2 days.
- [x] 6. Improve image handling. Estimated time: 1 to 2 days.
- [x] 7. Improve mobile layout quality. Estimated time: 1 to 2 days.
- [x] 8. Improve performance hygiene. Estimated time: 1 to 2 days.
- [x] 9. Add frontend error monitoring. Estimated time: 1 to 2 days.
- [x] 10. Improve accessibility. Estimated time: 1.5 to 3 days.
- [x] 11. Add frontend test coverage. Estimated time: 2 to 4 days.
- [x] 12. Create a shared UI system pass. Estimated time: 2 to 4 days.