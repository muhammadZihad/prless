import { useState } from 'react';
import type { Comment } from '../../shared/types';

interface Props {
  comments: Comment[];
  onAdd: (body: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  autoFocus?: boolean;
}

export function CommentThread({ comments, onAdd, onResolve, onDelete, autoFocus }: Props) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body);
    setDraft('');
  };

  return (
    <div className="thread">
      {comments.map((c) => (
        <div key={c.id} className={`comment ${c.status === 'resolved' ? 'resolved' : ''}`}>
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
      <div className="composer">
        <textarea
          autoFocus={autoFocus}
          value={draft}
          placeholder="Leave a comment…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
        />
        <div className="composer-actions">
          <button className="primary" onClick={submit} disabled={!draft.trim()}>
            Comment
          </button>
          <span className="hint">
            <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>↵</kbd> to submit
          </span>
        </div>
      </div>
    </div>
  );
}
