import { DestinyElement, xml, register, reactive } from "../destiny/src/mod";
import { toggleWeek, isNoClockInWeek } from "./utils";

export const isNoClock = reactive(isNoClockInWeek());
export class ReminderUi extends DestinyElement {
  template = xml`
    <style>
      main {
        position: fixed;
        z-index: 10000;
        left: 0;
        top: 0;
        width: 100vw;
        height: 100vh;

        visibility: hidden;
        pointer-events: none;

        font-family: Ubuntu, Arial, sans-serif;
      }

      main > * {
        visibility: visible;
        pointer-events: auto;
      }

      div.reminder-screen {
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;

        left: 0;
        top: 0;
        bottom: 0;
        right: 0;

        color: #fff;
        background: rgba(0, 0, 0, 0.75);
      }

      div.control {
        --distance: 30px;

        position: absolute;
        left: var(--distance);
        bottom: var(--distance);
        padding: 20px;

        border-radius: 4px;
        background: #222;
        color: #ddd;
      }

      div.control button {
        border-radius: 0px;
        border: 0px;

        padding: 10px 13px;
      }

      p {
        text-align: center;
        margin-bottom: 0;
        margin-top: 10px;

        font-size: 11px;
        opacity: 0.5;
      }
    </style>

    <main>
      ${ isNoClock.pipe(bool => bool
        ? xml`
          <div class="reminder-screen">
            <h1>You're not supposed to be clocking in!</h1>
          </div>
        `
        : xml`` ) }
        <div class="control">
          <button on:click="${() => (isNoClock.value = toggleWeek())}">
            ${ isNoClock.pipe(bool => bool ? "Disable" : "Enable") } reminder for this week
          </button>
          <p style="text-align: center;">
            <em>Don't you dare screw up this time</em>
          </p>
        </div>
    </main>
  `;
}

register(ReminderUi);

