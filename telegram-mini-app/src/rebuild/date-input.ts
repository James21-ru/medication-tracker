/** Formats a typed expiry date as DD.MM.YY(YY), without accepting invalid punctuation. */
export const formatExpiryDate = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
};

/** Returns an ISO date for persistence, or null when a completed date is invalid. */
export const expiryDateToIso = (value: string) => {
  const [day, month, rawYear] = value.split('.');
  if (!day || !month || !rawYear) return null;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const date = new Date(`${year}-${month}-${day}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
};
