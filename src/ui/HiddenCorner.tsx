import { useRef } from 'preact/hooks';

/**
 * Invisible top-left area (physically left, also in RTL). Holding it for 3 s leads the
 * Lernbegleitung to the PIN pad and the admin area.
 */
export function HiddenCorner({ onTrigger, holdMs = 3000 }: { onTrigger: () => void; holdMs?: number }) {
  const timer = useRef<number | undefined>();
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <div
      class="hidden-corner"
      onPointerDown={() => {
        cancel();
        timer.current = window.setTimeout(onTrigger, holdMs);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    />
  );
}
