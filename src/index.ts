import { ReminderUi, isNoClock as parentIsNoClock } from "./remind-gui";
import { OverlayUi, isNoClock as iframeIsNoClock, inChildFrame } from "./overlay-gui";
import { iframe, parentFrame } from "./comm";

addEventListener("DOMContentLoaded", () => {
  // Force Rollup to not TreeShake
  void ReminderUi;
  void OverlayUi;

  const isTimePunchFrame = !!document.getElementById("TL_RPT_TIME_FLU");
  const isDashboardOrPunchPage = !!(document.getElementById("PT_FLDASHBOARD") ?? document.querySelector('form#TL_RPT_TIME_FLU[name="win0"]'));

  if (isTimePunchFrame) {
    document.body.appendChild(document.createElement("overlay-ui"));
    iframe((isNoClock, isInChildFrame) => {
      iframeIsNoClock.set(isNoClock);
      inChildFrame.set(isInChildFrame);
    });
  }

  if (isDashboardOrPunchPage) {
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

