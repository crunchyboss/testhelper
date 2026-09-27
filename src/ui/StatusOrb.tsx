import type { Phase } from '../ai/pipeline';

interface Props {
  phase: Phase;
  /** 0..1 microphone level while listening. */
  level?: number;
  onTap?: () => void;
}

const ICON: Record<Phase, string> = { idle: '', listening: '🎤', thinking: '', speaking: '', error: '↻' };

/** Language-independent status: listening (red, pulses with level) · thinking (yellow dots) · speaking (blue waves). */
export function StatusOrb({ phase, level = 0, onTap }: Props) {
  const scale = phase === 'listening' ? 1 + level * 0.35 : 1;
  return (
    <button class={`orb orb-${phase}`} onClick={onTap} aria-label={phase} style={{ transform: `scale(${scale})` }}>
      {phase === 'thinking' && (
        <span class="orb-dots">
          <i />
          <i />
          <i />
        </span>
      )}
      {phase === 'speaking' && (
        <span class="orb-waves">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      {ICON[phase] && <span class="orb-icon">{ICON[phase]}</span>}
    </button>
  );
}
