import type { Comment } from '../../shared/types';

interface Props {
  comments: Comment[];
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}

/**
 * Open comments whose anchor no longer exists in the current diff. Surfaced
 * here so they aren't silently dropped when the code they referenced moves.
 */
export function OrphanedComments({ comments, onResolve, onDelete }: Props) {
  if (comments.length === 0) return null;

  return (
    <section className="orphaned">
      <header className="orphaned-header">
        <span>Orphaned comments</span>
        <span className="badge">{comments.length}</span>
      </header>
      <p className="orphaned-hint">
        These comments don’t match the current diff — the code they referenced may have moved or
        been removed.
      </p>
      {comments.map((c) => (
        <div key={c.id} className="orphaned-comment">
          <div className="orphaned-loc">
            {c.file} <span className="muted">· line {c.line} ({c.side})</span>
          </div>
          {c.snippet.trim() && <code className="orphaned-snippet">{c.snippet.trim()}</code>}
          <div className="comment-body">{c.body}</div>
          <div className="comment-actions">
            <span className={`status-chip ${c.status}`}>{c.status}</span>
            <span className="spacer" />
            <button onClick={() => onResolve(c.id, c.status !== 'resolved')}>
              {c.status === 'resolved' ? 'Reopen' : 'Resolve'}
            </button>
            <button onClick={() => onDelete(c.id)}>Delete</button>
          </div>
        </div>
      ))}
    </section>
  );
}
