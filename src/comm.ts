export type OnChangeCallback = (isNoClock: boolean, inChildFrame: boolean) => void;
export type ChangeMessage = {
  orgAzuga?: {
    isNoClock: boolean;
    inChildFrame: boolean;
  };
};
export type RegisterMessage = {
  orgAzuga?: {
    register: boolean;
  };
};

const hostname = "*";

export function iframe(
  onChange: OnChangeCallback,
) {
  addEventListener("message", (evt) => {
    const { orgAzuga }: ChangeMessage = evt.data ?? {};
    if (orgAzuga) {
      onChange(orgAzuga.isNoClock, orgAzuga.inChildFrame);
    }
  });

  // Register with parent frame
  let registerMsg: RegisterMessage = {
    orgAzuga: { register: true },
  };

  parent.postMessage(registerMsg, hostname);
}

function newChangeMessage(isNoClock: boolean, inChildFrame: boolean): ChangeMessage {
  return {
    orgAzuga: {
      isNoClock,
      inChildFrame,
    },
  };
}

export function parentFrame(
  onChildRegistered: () => { frame: HTMLIFrameElement, isNoClockInitial: boolean, },
) {
  let childWindow: Window | undefined;
  let inChildFrame: boolean;
  addEventListener("message", (evt) => {
    const { orgAzuga }: RegisterMessage = evt.data ?? {};

    if (orgAzuga?.register) {
      const { frame, isNoClockInitial } = onChildRegistered();
      childWindow = frame?.contentWindow ?? window;
      inChildFrame = childWindow !== window;
      childWindow?.postMessage(newChangeMessage(isNoClockInitial, inChildFrame), hostname);
    }
  });

  return (isNoClock: boolean) => {
    childWindow?.postMessage(newChangeMessage(isNoClock, inChildFrame), hostname);
  };
}

