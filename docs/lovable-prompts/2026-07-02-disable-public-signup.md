# Lovable prompt — remove public signup from the UI

Run this prompt in Lovable AFTER the backend PR that makes `POST /api/auth/signup` invite-only is merged and deployed (the endpoint now returns 403 unless `ALLOW_PUBLIC_SIGNUP=true`).

---

Signup is now invite-only: administrators add team members from Settings → Team, and the backend rejects self-service signup. Please update the frontend accordingly:

1. Remove the `/signup` route from `App.tsx` and delete `src/pages/Signup.tsx`.
2. On the Login page, remove any "Sign up" / "Create an account" link or button. In its place (small, muted text under the form) add: "Need an account? Ask your administrator for an invitation."
3. Do not change anything else about the Login page (email/password + Google OAuth stay as they are).
4. If any other component links to `/signup`, remove or repoint those links to `/login`.
