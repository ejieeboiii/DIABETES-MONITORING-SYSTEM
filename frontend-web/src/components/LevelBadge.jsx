import { LEVEL_LABELS, levelBg, levelColor } from '../utils/monitoring';

export default function LevelBadge({ level }) {
  level = level || 'unavailable';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border ${levelBg[level] || 'bg-white/5 border-white/10'} ${levelColor[level] || 'text-white/60'}`}>
      {LEVEL_LABELS[level] || level}
    </span>
  );
}
