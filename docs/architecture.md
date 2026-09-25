# Architecture — MVP

## Decision

Build an offline-first Expo application. SQLite remains the local operational database; an optional account adds encrypted-in-transit cloud backup and cross-device synchronization through Supabase Auth and PostgreSQL.

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

- Caregiver access and shared medication plans.
- Medicine catalog, interaction checks, and treatment guidance.
- Medicine catalog, camera recognition, interactions, and health recommendations.

## Cloud evolution path

Accounts and backup are now being introduced as optional capabilities. The local repository remains the source for offline interaction; sync is additive and must not block medication tracking. The cloud model and synchronization contract are documented in [cloud-sync.md](cloud-sync.md).
