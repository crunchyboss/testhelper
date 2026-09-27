import { useEffect, useState } from 'preact/hooks';

interface Props {
  pin: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/** Full-screen PIN entry for the Lernbegleitung. Not security, just keeps learners out of the admin area. */
export function PinPad({ pin, onSuccess, onCancel }: Props) {
  const [entered, setEntered] = useState('');
  const [wrong, setWrong] = useState(false);

  // Functional updates: fast taps must not read a stale value.
  const press = (digit: string) => {
    setWrong(false);
    setEntered((e) => (e + digit).slice(0, pin.length));
  };

  useEffect(() => {
    if (entered.length < pin.length) return;
    if (entered === pin) onSuccess();
    else {
      setWrong(true);
      setEntered('');
    }
  }, [entered]);

  return (
    <div class="overlay pinpad" dir="ltr">
      <div class={`pin-dots ${wrong ? 'shake' : ''}`}>
        {Array.from({ length: pin.length }, (_, i) => (
          <span key={i} class={i < entered.length ? 'filled' : ''} />
        ))}
      </div>
      <div class="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button class="pin-cancel" onClick={onCancel}>
          ✕
        </button>
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setEntered((e) => e.slice(0, -1))}>⌫</button>
      </div>
    </div>
  );
}
