import { describe, it, expect } from "vitest";
import { REMINDER_BEFORE_PRESETS, getReminderBeforeByMinutes } from "./reminderPresets";

describe("getReminderBeforeByMinutes", () => {
  it("finds the preset matching an exact minutes value", () => {
    expect(getReminderBeforeByMinutes(60)).toEqual({ label: "1 hour before", minutes: 60 });
  });

  it("returns undefined when no preset matches", () => {
    expect(getReminderBeforeByMinutes(42)).toBeUndefined();
  });

  it("has one entry per exported preset", () => {
    for (const preset of REMINDER_BEFORE_PRESETS) {
      expect(getReminderBeforeByMinutes(preset.minutes)).toEqual(preset);
    }
  });
});
