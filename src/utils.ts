import { DateTime, Duration } from "luxon";

function getCurWeekId() {
  const datetime = DateTime.now();
  const days = datetime.weekday - 1;
  return "bfuze-dnci-" + datetime.minus(Duration.fromObject({ days })).toSQLDate();
}

export function isNoClockInWeek() {
  const weekId = getCurWeekId();
  return !!localStorage.getItem(weekId);
}

export function toggleWeek() {
  const weekId = getCurWeekId();
  let newState = !isNoClockInWeek();

  if (newState) {
    localStorage.setItem(weekId, "1");
  } else {
    localStorage.removeItem(weekId);
  }

  return newState;
}

