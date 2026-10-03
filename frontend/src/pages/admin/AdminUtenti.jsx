import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { apiFetch } from "../../api";
import { formatEuro } from "../../format";
import AppHeader from "../../components/AppHeader";
import ConfirmDelete from "../../components/ConfirmDelete";
import "../AppHome.css";
import "../NuovoIntervento.css";
import "./Admin.css";

const EMPTY_FORM = { username: "", password: "", role: "tecnico", costo_orario: "0" };
const ROLE_LABEL = { tecnico: "Tecnico", admin: "Admin" };

export default function AdminUtenti() {
  const { user } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // null = form chiuso, "new" = creazione, numero = id in modifica
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isNew = editingId === "new";
  const isSelf = (id) => String(id) === String(user?.id);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await apiFetch("/users");
        if (!cancelled) setUsers(list || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossibile caricare gli utenti");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function onChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function openForm(id, values) {
    setForm(values);
    setFormError(null);
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const username = form.username.trim();
    const costo = Number(form.costo_orario);
    if (!username) {
      setFormError("Inserisci uno username");
      return;
    }
    if (isNew && !form.password) {
      setFormError("Inserisci una password");
      return;
    }
    if (!Number.isFinite(costo) || costo < 0 || costo > 999.99) {
      setFormError("Il costo orario deve essere tra 0 e 999,99 €");
      return;
    }

    const body = { username, role: form.role, costo_orario: costo };
    if (isNew) body.password = form.password;

    setSaving(true);
    setFormError(null);
    try {
      await apiFetch(isNew ? "/users" : `/users/${editingId}`, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(body),
      });
      setUsers(await apiFetch("/users"));
      setEditingId(null);
    } catch (err) {
      setFormError(err.message || "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch(`/users/${toDelete.id}`, { method: "DELETE" });
      setUsers((list) => list.filter((u) => u.id !== toDelete.id));
      if (editingId === toDelete.id) setEditingId(null);
    } catch (err) {
      setError(err.message || "Eliminazione non riuscita");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  return (
    <div className="app-home">
      <AppHeader />

      <main className="app-home__main">
        <div className="app-home__section-head">
          <h2>Utenti</h2>
          <button
            type="button"
            className="app-home__new"
            onClick={() => openForm("new", EMPTY_FORM)}
          >
            Nuovo utente
          </button>
        </div>

        {editingId !== null && (
          <form className="admin-panel" onSubmit={handleSubmit}>
            <h3>{isNew ? "Nuovo utente" : "Modifica utente"}</h3>
            <div className="nuovo__field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                value={form.username}
                onChange={onChange}
                autoComplete="off"
                required
                disabled={saving}
              />
            </div>

            {isNew ? (
              <div className="nuovo__field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={onChange}
                  autoComplete="new-password"
                  required
                  disabled={saving}
                />
              </div>
            ) : (
              <p className="nuovo__hint">La password si imposta solo in creazione.</p>
            )}

            <div className="nuovo__row">
              <div className="nuovo__field">
                <label htmlFor="role">Ruolo</label>
                <select
                  id="role"
                  name="role"
                  value={form.role}
                  onChange={onChange}
                  disabled={saving || isSelf(editingId)}
                >
                  <option value="tecnico">Tecnico</option>
                  <option value="admin">Admin</option>
                </select>
                {isSelf(editingId) && (
                  <p className="nuovo__hint">Non puoi cambiare il tuo ruolo.</p>
                )}
              </div>
              <div className="nuovo__field">
                <label htmlFor="costo_orario">Costo orario (€)</label>
                <input
                  id="costo_orario"
                  name="costo_orario"
                  type="number"
                  min="0"
                  max="999.99"
                  step="0.01"
                  inputMode="decimal"
                  value={form.costo_orario}
                  onChange={onChange}
                  required
                  disabled={saving}
                />
              </div>
            </div>

            {formError && <p className="nuovo__error">{formError}</p>}

            <div className="nuovo__actions">
              <button className="nuovo__submit" type="submit" disabled={saving}>
                {saving ? "Salvataggio…" : isNew ? "Salva" : "Aggiorna"}
              </button>
              <button
                className="nuovo__cancel"
                type="button"
                disabled={saving}
                onClick={() => setEditingId(null)}
              >
                Annulla
              </button>
            </div>
          </form>
        )}

        {loading && <p className="app-home__status">Caricamento…</p>}
        {error && <p className="app-home__error">{error}</p>}

        {!loading && users.length === 0 && (
          <p className="app-home__empty">Nessun utente registrato.</p>
        )}

        {users.length > 0 && (
          <div className="app-home__list">
            {users.map((u) => (
              <div
                className={
                  editingId === u.id
                    ? "app-home__row app-home__row--selected"
                    : "app-home__row"
                }
                key={u.id}
              >
                <div className="app-home__row-inner">
                  <div className="app-home__sticky">
                    <div className="app-home__cell admin__cell--main">
                      <span className="app-home__label">Username</span>
                      <span className="app-home__value" title={u.username}>
                        {u.username}
                        {isSelf(u.id) ? " (tu)" : ""}
                      </span>
                    </div>
                    <div className="app-home__cell admin__cell--short">
                      <span className="app-home__label">Ruolo</span>
                      <span className="app-home__value">{ROLE_LABEL[u.role] || u.role}</span>
                    </div>
                    <div className="app-home__actions">
                      <button
                        type="button"
                        className="app-home__btn app-home__btn--edit"
                        onClick={() =>
                          openForm(u.id, {
                            username: u.username,
                            password: "",
                            role: u.role,
                            costo_orario: String(u.costo_orario),
                          })
                        }
                      >
                        Modifica
                      </button>
                      {!isSelf(u.id) && (
                        <button
                          type="button"
                          className="app-home__btn app-home__btn--danger"
                          onClick={() => setToDelete(u)}
                        >
                          Elimina
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="app-home__extra">
                    <div className="app-home__cell">
                      <span className="app-home__label">Costo orario</span>
                      <span className="app-home__value">
                        {formatEuro(u.costo_orario)}/h
                      </span>
                    </div>
                    <div className="app-home__cell">
                      <span className="app-home__label">ID</span>
                      <span className="app-home__value app-home__value--muted">
                        #{u.id}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {toDelete && (
        <ConfirmDelete
          title="Eliminare l'utente?"
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Stai per eliminare <strong>{toDelete.username}</strong>. Non è possibile
          se ha interventi registrati.
        </ConfirmDelete>
      )}
    </div>
  );
}
