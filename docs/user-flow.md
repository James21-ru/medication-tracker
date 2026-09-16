# Primary user flow

## Onboarding

```text
Launch
  -> Welcome: product purpose and medical disclaimer
  -> Notification permission explanation
  -> Add first medication
  -> Set dosage and schedule
  -> Choose reminder settings
  -> Today
```

Notification permission is requested only after the person has configured a schedule and understands its value.

## Daily intake

```text
Local notification
  -> Open Today
  -> Select a planned dose
  -> Taken / Skipped
  -> Small success state
  -> Dose event appears in history
```

## Add medication

```text
Medication name
  -> Form and dosage
  -> Frequency and time(s)
  -> Reminder choice
  -> Color and icon
  -> Review
  -> Save
```

## Information architecture

- Today — next dose, remaining doses, completed doses.
- Medications — active and archived medications; add and edit.
- History — day picker and medication events.
- Settings — reminder behavior, privacy, and app information.
