import React from "react";

export interface ProgressBarProps {
  current: number;
  total: number;
}

export default function ProgressBar({
  current,
  total,
}: ProgressBarProps): React.JSX.Element {
  const percent = total <= 0 ? 0 : Math.round((current / total) * 100);
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${percent}%` }} />
      <span className="progress-label">{percent}%</span>
    </div>
  );
}
