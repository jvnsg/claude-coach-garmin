import { describe, it, expect } from "vitest";
import type { GarminActivity, GarminSocialProfile } from "../../src/garmin/types.js";

describe("Garmin Types", () => {
  describe("GarminActivity", () => {
    it("should have required fields", () => {
      const activity: GarminActivity = {
        activityId: 12345678,
        activityName: "Morning Run",
        startTimeLocal: "2024-01-15 07:30:00",
        startTimeGMT: "2024-01-15 06:30:00",
        activityType: { typeKey: "running", typeId: 1 },
        duration: 3600,
        movingDuration: 3500,
        distance: 10000,
        elevationGain: 150,
        averageSpeed: 2.86,
        maxSpeed: 4.5,
      };

      expect(activity.activityId).toBe(12345678);
      expect(activity.activityName).toBe("Morning Run");
      expect(activity.activityType.typeKey).toBe("running");
      expect(activity.distance).toBe(10000);
    });

    it("should allow optional fields", () => {
      const activity: GarminActivity = {
        activityId: 12345678,
        activityName: "Ride with Power",
        startTimeLocal: "2024-01-15 07:30:00",
        startTimeGMT: "2024-01-15 06:30:00",
        activityType: { typeKey: "cycling", typeId: 2 },
        duration: 7200,
        movingDuration: 7000,
        distance: 50000,
        elevationGain: 500,
        averageSpeed: 7.14,
        maxSpeed: 15.0,
        averagePower: 200,
        maxPower: 450,
        averageHR: 145,
        maxHR: 175,
      };

      expect(activity.averagePower).toBe(200);
      expect(activity.averageHR).toBe(145);
    });
  });

  describe("GarminSocialProfile", () => {
    it("should have required fields", () => {
      const profile: GarminSocialProfile = {
        profileId: 99999,
        displayName: "johndoe",
        fullName: "John Doe",
      };

      expect(profile.profileId).toBe(99999);
      expect(profile.displayName).toBe("johndoe");
      expect(profile.fullName).toBe("John Doe");
    });

    it("should allow weight in grams", () => {
      const profile: GarminSocialProfile = {
        profileId: 99999,
        displayName: "janedoe",
        fullName: "Jane Smith",
        weight: 65500, // 65.5 kg in grams
      };

      expect(profile.weight).toBe(65500);
      // Convert to kg
      expect(profile.weight! / 1000).toBe(65.5);
    });
  });
});

describe("Garmin Data Helpers", () => {
  describe("startTimeGMT conversion", () => {
    it("should convert Garmin GMT time format to ISO 8601", () => {
      const startTimeGMT = "2024-01-15 06:30:00";
      const iso = startTimeGMT.replace(" ", "T") + "Z";
      expect(iso).toBe("2024-01-15T06:30:00Z");
    });
  });

  describe("weight conversion", () => {
    it("should convert grams to kg", () => {
      const weightGrams = 70000;
      expect(weightGrams / 1000).toBe(70);
    });
  });

  describe("kilojoules calculation", () => {
    it("should calculate kilojoules from average power and duration", () => {
      const averagePower = 200; // watts
      const movingDuration = 3600; // seconds
      const kilojoules = (averagePower * movingDuration) / 1000;
      expect(kilojoules).toBe(720);
    });
  });

  describe("date calculations", () => {
    it("should calculate date N days ago", () => {
      const now = new Date("2024-06-15T12:00:00Z");
      const daysAgo = 365;

      const afterDate = new Date(now);
      afterDate.setDate(afterDate.getDate() - daysAgo);

      expect(afterDate.getFullYear()).toBe(2023);
      expect(afterDate.getMonth()).toBe(5); // June (0-indexed)
    });
  });
});

describe("SQL Escaping", () => {
  function escapeString(str: string | null | undefined): string {
    if (str == null) return "NULL";
    return `'${str.replace(/'/g, "''")}'`;
  }

  it("should escape single quotes", () => {
    expect(escapeString("O'Reilly")).toBe("'O''Reilly'");
    expect(escapeString("It's a test")).toBe("'It''s a test'");
  });

  it("should handle null and undefined", () => {
    expect(escapeString(null)).toBe("NULL");
    expect(escapeString(undefined)).toBe("NULL");
  });

  it("should wrap normal strings in quotes", () => {
    expect(escapeString("hello")).toBe("'hello'");
    expect(escapeString("Morning Run")).toBe("'Morning Run'");
  });

  it("should handle empty strings", () => {
    expect(escapeString("")).toBe("''");
  });

  it("should handle multiple quotes", () => {
    expect(escapeString("It's John's bike")).toBe("'It''s John''s bike'");
  });
});
