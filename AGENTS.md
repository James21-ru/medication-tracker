# Medication Tracker project guidance

## Product boundaries

- This is a medication adherence tracker, not a medical device, diagnostic tool, or source of medical advice.
- Do not add medication interaction checks, dosing recommendations, diagnosis, or treatment guidance without a separate clinical and regulatory review.
- The MVP is local-first and must work without an account or a network connection.

## Stack

- Expo + React Native + TypeScript
- Expo Router
- SQLite for persistence
- Expo Notifications for reminders

## UX principles

- The Today screen prioritizes the next action above all else.
- Marking a dose taken or skipped takes one deliberate tap plus confirmation only where necessary.
- Use original product naming, visual assets, and copy. Apple Health is a functional and visual reference, not a source to copy.
- Apply a restrained translucent glass treatment to control bars on iOS; maintain contrast and an Android-appropriate fallback.

## Quality bar

- Prefer clear, typed domain models and small components.
- Do not store secrets in the repository.
- Run formatting, type checks, and the relevant tests before declaring a change complete.
