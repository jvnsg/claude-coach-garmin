export interface GarminActivityType {
  typeKey: string;
  typeId: number;
}

export interface GarminActivity {
  activityId: number;
  activityName: string;
  startTimeLocal: string; // "YYYY-MM-DD HH:MM:SS"
  startTimeGMT: string; // "YYYY-MM-DD HH:MM:SS"
  activityType: GarminActivityType;
  duration: number; // seconds (elapsed)
  movingDuration?: number; // seconds
  distance?: number; // meters
  elevationGain?: number; // meters
  averageSpeed?: number; // m/s
  maxSpeed?: number; // m/s
  averageHR?: number;
  maxHR?: number;
  averagePower?: number; // watts
  maxPower?: number; // watts
  normPower?: number; // normalized power (watts)
  calories?: number;
  averageRunningCadenceInStepsPerMinute?: number;
  averageBikingCadenceInRevPerMinute?: number;
  averageSwimmingCadenceInStrokesPerMinute?: number;
  description?: string;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
}

export interface GarminSocialProfile {
  profileId: number;
  displayName: string;
  fullName?: string;
  userName?: string;
  weight?: number; // grams
}
