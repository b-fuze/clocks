export type OnChangeCallback = (isNoClock: boolean) => void;
export type ChangeMessage = {
  orgAzuga?: {
    isNoClock: boolean;
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
      onChange(orgAzuga.isNoClock);
    }
  });

  // Register with parent frame
  let registerMsg: RegisterMessage = {
    orgAzuga: { register: true },
  };

  parent.postMessage(registerMsg, hostname);
}

function newChangeMessage(isNoClock: boolean): ChangeMessage {
  return {
    orgAzuga: { isNoClock },
  };
}

export function parentFrame(
  setChildFrame: () => HTMLIFrameElement,
  isNoClockInitial: boolean,
) {
  let childWindow: Window | undefined;
  addEventListener("message", (evt) => {
    const { orgAzuga }: RegisterMessage = evt.data ?? {};

    if (orgAzuga?.register) {
      childWindow = setChildFrame().contentWindow!;
      childWindow?.postMessage(newChangeMessage(isNoClockInitial), hostname);
    }
  });

  return (isNoClock: boolean) => {
    childWindow?.postMessage(newChangeMessage(isNoClock), hostname);
  };
}

