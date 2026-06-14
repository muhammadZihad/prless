import { useState } from 'react';
import type { Comment } from '../../shared/types';

interface Props {
  comments: Comment[];
  onAdd: (body: string) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  autoFocus?: boolean;
  driftedIds?: Set<string>;
  showComposer?: boolean;
  placeholder?: string;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onCancel?: () => void; // close/dismiss the composer
  onReply?: () => void; // open the composer on an existing thread
}

export function CommentThread({
  comments,
  onAdd,
  onResolve,
  onDelete,
  autoFocus,
  driftedIds,
  showComposer = true,
  placeholder = 'Leave a comment…',
  selectedIds,
  onToggleSelect,
  onCancel,
  onReply,
}: Props) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body);
    setDraft('');
  };

  const cancel = () => {
    setDraft('');
    onCancel?.();
  };

  return (
    <div className="thread">
      {comments.map((c) => (
        <div key={c.id} className={`review-comment ${c.status === 'resolved' ? 'resolved' : ''}`}>
          <div className="comment-body">{c.body}</div>
          <div className="comment-actions">
            {onToggleSelect && (
              <label className="select-comment" title="Include in export">
                <input
                  type="checkbox"
                  checked={selectedIds?.has(c.id) ?? false}
                  onChange={() => onToggleSelect(c.id)}
                />
              </label>
            )}
            <span className={`status-chip ${c.status}`}>{c.status}</span>
            {driftedIds?.has(c.id) && (
              <span className="drift-badge" title="The code on this line changed since the comment was written.">
                code changed
              </span>
            )}
            <span className="spacer" />
            <button onClick={() => onResolve(c.id, c.status !== 'resolved')}>
              {c.status === 'resolved' ? 'Reopen' : 'Resolve'}
            </button>
            <button onClick={() => onDelete(c.id)}>Delete</button>
          </div>
        </div>
      ))}
      {showComposer ? (
        <div className="composer">
          <textarea
            autoFocus={autoFocus}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
              else if (e.key === 'Escape' && onCancel) cancel();
            }}
          />
          <div className="composer-actions">
            <button className="primary" onClick={submit} disabled={!draft.trim()}>
              Comment
            </button>
            {onCancel && (
              <button onClick={cancel} title="Close (Esc)">
                Cancel
              </button>
            )}
            <span className="hint">
              <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>↵</kbd> to submit
            </span>
          </div>
        </div>
      ) : (
        onReply && (
          <button className="thread-reply" onClick={onReply}>
            + Add a comment
          </button>
        )
      )}
    </div>
  );
}
