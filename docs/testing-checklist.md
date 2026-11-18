# BuildMate smoke testing checklist

Use a dedicated test account and Firebase test project. These are proposed manual checks, not recorded test results.

- [ ] Open the application and sign in with a test account.
- [ ] Complete onboarding and check that the profile persists after refresh.
- [ ] Exercise profile parsing (`/api/parse-profile`) with valid and incomplete input.
- [ ] Generate project ideas (`/api/generate-projects`) and inspect the response.
- [ ] Request project suggestions (`/api/suggest-projects`) and check loading and error states.
- [ ] Create a project (`/api/create-project`) and inspect the generated milestones and tasks.
- [ ] Update a task and check that progress persists after refresh.
- [ ] Ask the AI mentor (`/api/chat`) a project-specific question and check the response for relevance.
- [ ] Simulate an unavailable AI service and verify that errors do not expose credentials.
- [ ] Sign out and verify that another test account cannot access the first account's private data.
- [ ] Check the dashboard and project pages at mobile and desktop widths.
- [ ] Run `npm run build` and record the result.

Record the date, environment, expected outcome, actual outcome, and any reproducible defect for each failed check.

AI-assisted checklist; execution and review remain pending.
