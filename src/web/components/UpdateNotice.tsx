interface Props {
  latest: string;
  command: string;
  onCopy: () => void;
}

/** Sticky notice at the bottom of the sidebar when a newer version is on npm. */
export function UpdateNotice({ latest, command, onCopy }: Props) {
  return (
    <div className="update-notice">
      <div className="update-notice-head">
        <span className="update-dot" aria-hidden />
        <strong>v{latest} available</strong>
      </div>
      <code className="update-cmd" title={command}>
        {command}
      </code>
      <button className="update-copy" onClick={onCopy}>
        Copy update command
      </button>
    </div>
  );
}
