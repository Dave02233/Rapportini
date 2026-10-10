import "../pages/AppHome.css";

export default function ConfirmDelete({ title, busy, onCancel, onConfirm, children }) {
  return (
    <div
      className="app-home__modal-backdrop"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="app-home__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-delete-title">{title}</h3>
        <p>{children}</p>
        <div className="app-home__modal-actions">
          <button
            type="button"
            className="app-home__btn app-home__btn--ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Annulla
          </button>
          <button
            type="button"
            className="app-home__btn app-home__btn--danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Eliminazione..." : "Elimina"}
          </button>
        </div>
      </div>
    </div>
  );
}
