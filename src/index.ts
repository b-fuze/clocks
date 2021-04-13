import { ReminderUi, isNoClock as parentIsNoClock } from "./remind-gui";
import { OverlayUi, isNoClock as iframeIsNoClock } from "./overlay-gui";
import { iframe, parentFrame } from "./comm";

addEventListener("DOMContentLoaded", () => {
  // Force Rollup to not TreeShake
  void ReminderUi;
  void OverlayUi;

  const isTimePunchFrame = !!document.getElementById("TL_RPT_TIME_FLU");
  const isDashboard = !!document.getElementById("PT_FLDASHBOARD");

  if (isTimePunchFrame) {
    document.body.appendChild(document.createElement("overlay-ui"));
    iframe((isNoClock) => {
      iframeIsNoClock.set(isNoClock);
    });
  }

  if (isDashboard) {
    document.body.appendChild(document.createElement("reminder-ui"));
    const updateChild = parentFrame(() => ({
      frame: document.querySelector('iframe[title="Report Time"]') as HTMLIFrameElement,
      isNoClockInitial: parentIsNoClock.value,
    }));

    // Update child frame when stuff change
    parentIsNoClock.bind((isNoClock) => {
      updateChild(isNoClock);
    });
  }
});

