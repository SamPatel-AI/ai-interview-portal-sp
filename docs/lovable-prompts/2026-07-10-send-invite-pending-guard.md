# Lovable prompt — disable Send Invite / Re-send while the request is in flight

Run this prompt in Lovable any time; ideally after backend PR #48 (atomic invite claim) is merged, but it is safe in either order. Background: the Send Invite button on the Pipeline Kanban fires immediately on click with no pending state, so a double-click sends two requests. The backend now rejects the second atomically (409), but the button should not allow it in the first place, and the recruiter should see that the send is in progress.

---

On the Pipeline page, the Send Invite and Re-send buttons can be clicked repeatedly while a send is already in flight. Please add pending guards, keeping the architecture rules: Page → Hook → Service → API, domain imports only from barrels, no magic values, don't touch `components/ui/`.

1. In `src/pages/Applications.tsx`, the mutations already exist (`approveInterviewMutation`, `resendInviteMutation`). Pass their `isPending` down to `ApplicationsKanban` as two new props (e.g. `invitePending`, `resendPending`), and make `openInviteDialog` return early when `approveInterviewMutation.isPending` is true.

2. In `src/components/organisms/applications/ApplicationsKanban.tsx`, set `disabled` on the "Send Invite" button (New column) when `invitePending`, and on the "Re-send" button (failed cards) when `resendPending`. Match the existing disabled styling shadcn buttons get automatically — no custom styles needed.

3. Leave the `InviteDeadlineDialog` confirm flow as is — it already receives `isPending`.
