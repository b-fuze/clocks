import { DestinyElement, xml, register, reactive } from "../destiny/src/mod";

export const isNoClock = reactive(false);
export class OverlayUi extends DestinyElement {
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

      h1 {
        font-size: 20px;
        text-align: center;
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
    </main>
  `;
}

register(OverlayUi);

