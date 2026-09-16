# Architecture — MVP

## Decision

Build an offline-first Expo application. The initial release stores health-related records only on the device and does not require an account, a backend, or cloud infrastructure.

## Why this is the right first architecture

- A medication reminder must remain usable without an internet connection.
- Removing registration makes the first-use path shorter.
- Health-related data stays private by default.
- The product can be tested with real users before operating a server or handling cloud backups.

## Layers

```text
Expo / React Native UI
        |
Domain layer: medication, schedule, dose event
        |
Repository layer: SQLite
        |
System integration: local notifications
```

## Core domain entities

| Entity | Responsibility |
| --- | --- |
| Medication | Name, form, dosage, visual identity, note, active/archived status. |
| Schedule | Recurrence and time(s) defining planned intake. |
| Dose event | Immutable record of a planned or as-needed intake, including status and timestamp. |
| Notification | Local identifier mapping a scheduled dose to an operating-system reminder. |

## Deliberately deferred

- Accounts, authentication, sync, sharing, and caregiver access.
- FastAPI, PostgreSQL, Yandex Cloud, and Yandex GPT.
- Medicine catalog, camera recognition, interactions, and health recommendations.

## Evolution path

When interviews validate a need for cross-device backup or caregiver access, add FastAPI + PostgreSQL behind a versioned API. The local repository remains the source for offline interaction; sync becomes an additive capability.
