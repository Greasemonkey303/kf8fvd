# Frontend Hardening Checklist

Use this as the follow-up production checklist for UI, UX, performance, accessibility, and admin front-end cleanup.

## 1. Finish Removing Admin Inline Styles

- [ ] Replace remaining inline `style={...}` usage across admin pages with CSS modules or shared classes.
- [ ] Re-tighten admin CSP after inline style cleanup is complete.
- [ ] Verify the admin area still renders correctly after CSP is tightened again.

## 2. Standardize Admin Data Fetching

- [ ] Confirm all client-side admin fetches use the same-origin `/admin/*` or `/admin/api/*` pattern.
- [ ] Remove any remaining browser calls to `/api/admin/*` that could be intercepted by Cloudflare Access.
- [ ] Keep admin link prefetch behavior intentional so background fetch noise does not return.

## 3. Improve Error States

- [ ] Add consistent error UI for failed fetches, uploads, and save actions.
- [ ] Make admin screens show actionable retry states instead of silent failures.
- [ ] Ensure public pages degrade cleanly when API data is temporarily unavailable.

## 4. Improve Loading States

- [ ] Standardize loading indicators across admin and public pages.
- [ ] Replace ad hoc spinners/placeholders with a consistent loading pattern.
- [ ] Verify all long-running actions visibly show in-progress state.

## 5. Tighten Form UX

- [ ] Standardize validation messages across sign-in, contact, reset-password, and admin forms.
- [ ] Make button disabled states, busy states, and success states consistent.
- [ ] Ensure all destructive actions use clear confirmation UI.

## 6. Improve Accessibility

- [ ] Audit keyboard navigation across public and admin pages.
- [ ] Verify labels, aria relationships, focus order, and focus restoration on dialogs.
- [ ] Check contrast, visible focus states, and screen-reader feedback for status/error messages.

## 7. Improve Mobile Layout Quality

- [ ] Test every main public page on mobile widths.
- [ ] Test the admin area on tablet/mobile widths for overflow and layout breakage.
- [ ] Fix cramped controls, overflowing tables, and modal sizing issues.

## 8. Improve Image Handling

- [ ] Audit image rendering paths for public and admin pages.
- [ ] Standardize object-fit, preview, thumbnail, and fallback behavior.
- [ ] Confirm uploaded MinIO-backed images always resolve through the intended proxy/public path.

## 9. Add Frontend Error Monitoring

- [ ] Add a lightweight strategy for capturing client-side runtime errors.
- [ ] Track failed fetches and repeated UI errors in a structured way.
- [ ] Decide whether browser console-only debugging is sufficient long term.

## 10. Add Frontend Test Coverage

- [ ] Add Playwright coverage for key public flows.
- [ ] Add Playwright coverage for admin login, content edits, and delete flows.
- [ ] Add regression coverage for Cloudflare Access-sensitive admin navigation.

## 11. Improve Performance Hygiene

- [ ] Audit unused preloads, duplicate scripts, and heavy client-side effects.
- [ ] Reduce unnecessary client re-renders and repeated fetches.
- [ ] Verify image loading, lazy loading, and route transitions remain smooth.

## 12. Create A Shared UI System Pass

- [ ] Standardize shared button, input, table, modal, badge, and status styles.
- [ ] Reduce one-off page-specific UI patterns where they create maintenance burden.
- [ ] Keep public and admin interfaces visually consistent without overcomplicating the code.

## Suggested Priority Order

- [ ] 1. Finish removing admin inline styles.
- [ ] 2. Standardize admin data fetching and confirm no Cloudflare Access regressions.
- [ ] 3. Improve error and loading states.
- [ ] 4. Add frontend regression coverage for key user/admin flows.
- [ ] 5. Do a mobile and accessibility pass before large content entry begins.