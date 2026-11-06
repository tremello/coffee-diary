// React passes events from a portal up to the component that opened it (a bean card that toggles on click and swipes on
// drag, a form sheet that drags down), so the photo layers keep their taps and drags to themselves.
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
export const stopBubbling = { onPointerDown: stop, onPointerMove: stop, onPointerUp: stop, onPointerCancel: stop, onKeyDown: stop, onTouchStart: stop, onTouchMove: stop, onTouchEnd: stop };
