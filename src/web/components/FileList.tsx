import type { Comment } from '../../shared/types';
import { filePath, type FileDiff } from '../diffUtils';

interface Props {
  files: FileDiff[];
  comments: Comment[];
  activeFile?: string | null; // highlighted file (single-file mode)
  onSelect?: (path: string) => void; // single-file mode: select instead of just scrolling
}

/** Put a file in the URL (no history spam) and scroll it into view. */
export function focusFile(path: string): void {
  const id = `file-${path}`;
  window.history.replaceState(null, '', `#${id}`);
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
}

export function FileList({ files, comments, activeFile, onSelect }: Props) {
  const counts = new Map<string, number>();
  for (const c of comments) {
    if (c.status === 'open') counts.set(c.file, (counts.get(c.file) ?? 0) + 1);
  }

  return (
    <nav className="file-list">
      <h2>Changed files ({files.length})</h2>
      <ul>
        {files.map((file) => {
          const path = filePath(file);
          const count = counts.get(path) ?? 0;
          const isActive = activeFile === path;
          return (
            <li key={path}>
              <a
                href={`#file-${path}`}
                title={path}
                className={isActive ? 'is-active' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onSelect?.(path); // single-file mode: render just this file
                  focusFile(path); // always reflect the file in the URL + scroll
                }}
              >
                <span className={`ftype ftype-${file.type}`}>{file.type[0].toUpperCase()}</span>
                <span className="file-list-path">{path}</span>
                {count > 0 && <span className="badge">{count}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
