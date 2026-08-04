# Hill Chart

A collaborative hill chart tool for tracking project scope progress. Built with Next.js, Firebase Realtime Database, and Tailwind CSS v4.

## Setup

```bash
npm install
npx playwright install  # for E2E tests
```

Create `.env.local`:

```
NEXT_PUBLIC_FIREBASE_DB_URL=https://your-project.firebasedatabase.app/
NEXT_PUBLIC_FIREBASE_DB_PREFIX=dev
```

Run the dev server:

```bash
npm run dev
```

## Firebase

This app uses Firebase Realtime Database for persistence and real-time sync. No authentication SDK is needed — the app uses a simple password gate with a hashed password stored in the database.

### Database rules

Set these in Firebase Console > Realtime Database > Rules:

```json
{
  "rules": {
    "$env": {
      "password": {
        ".read": true,
        ".write": false
      },
      "$other": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

### Setting a password

Generate a SHA-256 hash of your password:

```bash
echo -n "your-password" | shasum -a 256
```

In the Firebase Console, create the key `{prefix}/password` (e.g. `dev/password` or `prod/password`) and set its value to the hash output.

If no password key exists, the app is accessible without a password.

## Deployment

Deployment is handled by Vercel's [Git integration](https://vercel.com/docs/deployments/git/vercel-for-github):

- Every push to `main` deploys to **production**
- Every push to any other branch (and every PR) gets its own **preview** deployment, with the URL commented on the PR

No deploy secrets are needed in GitHub — Vercel builds and deploys on its own
infrastructure. A separate [CI workflow](.github/workflows/ci.yml) runs unit
tests on every push and PR; it requires no secrets, so it's safe for forks.

### Vercel project setup

Environment variables live in Vercel project settings (not GitHub):

- `NEXT_PUBLIC_FIREBASE_DB_URL` — your Firebase RTDB URL
- `NEXT_PUBLIC_FIREBASE_DB_PREFIX` — `prod` for production; optionally `dev` for preview deployments

Vercel deploys on push regardless of CI status. To keep failing tests out of
production, protect `main` in GitHub (Settings → Branches → require the **CI /
test** check to pass) so changes land via PRs that must be green before merging.

### Rollback

```bash
vercel rollback            # revert to the previous production deployment
vercel rollback <url>      # revert to a specific deployment
```

## Testing

```bash
npm test          # unit + E2E
npm run test:unit # vitest only
npm run test:e2e  # playwright only
```

Tests run against a separate `test` prefix in Firebase so they don't affect dev or prod data.

## Environment prefixes

The `NEXT_PUBLIC_FIREBASE_DB_PREFIX` variable namespaces all data in Firebase:

| Environment | Prefix | Data path |
|-------------|--------|-----------|
| Local dev | `dev` | `/dev/hills/...` |
| Tests | `test` | `/test/hills/...` |
| Production | `prod` | `/prod/hills/...` |
