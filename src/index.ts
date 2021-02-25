import { ReminderUi } from "./gui";

addEventListener("DOMContentLoaded", () => {
  // Force Rollup to not TreeShake
  void ReminderUi;
  document.body.appendChild(document.createElement("reminder-ui"));
});

