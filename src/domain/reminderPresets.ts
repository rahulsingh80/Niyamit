/** "Before due" reminder presets: label and minutes. */
export const REMINDER_BEFORE_PRESETS: { label: string; minutes: number }[] = [
  { label: "10 mins before", minutes: 10 },
  { label: "30 mins before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "3 hours before", minutes: 180 },
  { label: "1 day before", minutes: 1440 },
  { label: "2 days before", minutes: 2880 },
  { label: "3 days before", minutes: 4320 },
  { label: "1 week before", minutes: 10080 },
];

export function getReminderBeforeByMinutes(minutes: number): { label: string; minutes: number } | undefined {
  return REMINDER_BEFORE_PRESETS.find((p) => p.minutes === minutes);
}
