# Local development setup

1. Install Node.js 20.9 or newer and npm.
2. Clone the repository: `git clone https://github.com/riyaaryan50/BuildMate.git`.
3. Run `cd BuildMate` and `npm ci`.
4. Create a local `.env.local` file using your own Firebase project and Gemini credentials.

Firebase configuration keys used in `lib/firebase.ts`:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

The current AI routes read `NEXT_PUBLIC_GEMINI_API_KEY`; profile parsing also supports `GEMINI_API_KEY`. Use a restricted development key for local testing only. A follow-up security improvement should migrate all AI routes to a server-only `GEMINI_API_KEY` before production use. Never commit real credentials or share local environment files.

Run `npm run dev` and open http://localhost:3000. For a production build check, run `npm run build` and then `npm start` if the build succeeds. Configure Firebase Authentication and Firestore in your own test project before exercising authenticated features.

AI-assisted documentation, based on the current project source.
