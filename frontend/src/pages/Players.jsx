import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Check,
  Edit3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";

const API_URL =
  import.meta.env.VITE_PLAYER_API_URL ||
  "http://localhost:4002/api/v1/players";

const ROLES = [
  { value: "batter", label: "Batter" },
  { value: "bowler", label: "Bowler" },
  { value: "wicket-keeper", label: "Wicket Keeper" },
  { value: "batting-all-rounder", label: "Batting All-Rounder" },
  { value: "bowling-all-rounder", label: "Bowling All-Rounder" },
];

const inputClass =
  "w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-3 text-sm text-white outline-none placeholder:text-zinc-600 transition focus:border-emerald-400/50";

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:border-emerald-400/30 hover:text-white disabled:opacity-50";

const emptyForm = {
  name: "",
  age: "",
  role: "batter",
  battingStyle: "right-handed",
  bowlingStyle: "",
};

function getRoleLabel(role) {
  return ROLES.find((item) => item.value === role)?.label || "Batter";
}

function getInitials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "P"
  );
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    const details = Array.isArray(result.details)
      ? result.details.map((item) => item.message).filter(Boolean).join(", ")
      : "";

    throw new Error(
      [result.message || `Request failed (${response.status}).`, details]
        .filter(Boolean)
        .join(" ")
    );
  }

  return result;
}

export default function Players({ onLogout }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await apiRequest(API_URL);
      const records = result.data?.players;

      setPlayers(Array.isArray(records) ? records : []);
    } catch (err) {
      setError(err.message || "Unable to load players.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const activeCount = players.filter((player) => player.isActive).length;
  const inactiveCount = players.length - activeCount;

  const visiblePlayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return players.filter((player) => {
      const matchesSearch = [
        player.name,
        player.role,
        getRoleLabel(player.role),
        player.battingStyle,
        player.bowlingStyle,
      ].some((value) => String(value ?? "").toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && player.isActive) ||
        (statusFilter === "inactive" && !player.isActive);

      const matchesRole =
        roleFilter === "all" || (player.role || "batter") === roleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [players, search, statusFilter, roleFilter]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function openEdit(player) {
    setEditing(player);
    setForm({
      name: player.name ?? "",
      age: player.age == null ? "" : String(player.age),
      role: player.role || "batter",
      battingStyle: player.battingStyle || "right-handed",
      bowlingStyle: player.bowlingStyle || "",
    });
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setForm({ ...emptyForm });
  }

  function updateForm(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const name = form.name.trim();

    if (name.length < 2) {
      setError("Player name must contain at least 2 characters.");
      return;
    }

    if (!ROLES.some((role) => role.value === form.role)) {
      setError("Please select a valid player role.");
      return;
    }

    if (form.age !== "") {
      const age = Number(form.age);

      if (!Number.isInteger(age) || age < 5 || age > 100) {
        setError("Age must be a whole number between 5 and 100.");
        return;
      }
    }

    const payload = {
      name,
      role: form.role,
      battingStyle: form.battingStyle,
      bowlingStyle: form.bowlingStyle.trim(),
    };

    if (form.age !== "") {
      payload.age = Number(form.age);
    }

    setSaving(true);

    try {
      if (editing) {
        await apiRequest(`${API_URL}/${editing._id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        setNotice("Player details updated successfully.");
      } else {
        await apiRequest(API_URL, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        setNotice("Player added successfully.");
      }

      setModalOpen(false);
      setEditing(null);
      setForm({ ...emptyForm });

      await loadPlayers();
    } catch (err) {
      setError(err.message || "Unable to save player.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivatePlayer(player) {
    if (
      !window.confirm(
        `Deactivate ${player.name}? Their record will be preserved.`
      )
    ) {
      return;
    }

    setError("");
    setNotice("");
    setDeletingId(player._id);

    try {
      await apiRequest(`${API_URL}/${player._id}`, {
        method: "DELETE",
      });

      setNotice(`${player.name} was deactivated.`);
      await loadPlayers();
    } catch (err) {
      setError(err.message || "Unable to deactivate player.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-9 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div>
            <Link
              to="/home"
              className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-emerald-300"
            >
              <ArrowLeft size={16} />
              Back to Home
            </Link>

            <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">
              Cricket management
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Player <span className="text-emerald-400">management.</span>
            </h1>

            <p className="mt-2 text-sm text-zinc-400">
              Manage your squad, playing roles and player details.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadPlayers}
              disabled={loading}
              className={secondaryButton}
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className={secondaryButton}
              >
                Log out
              </button>
            )}
          </div>
        </header>

        {/* Notifications */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-300"
          >
            <ShieldAlert size={19} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm text-emerald-300"
          >
            <Check size={19} className="mt-0.5 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/* Summary cards */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              label: "Total players",
              value: players.length,
              note: "Players in your roster",
              icon: Users,
            },
            {
              label: "Active players",
              value: activeCount,
              note: "Available for selection",
              icon: Activity,
            },
            {
              label: "Inactive players",
              value: inactiveCount,
              note: "Preserved player records",
              icon: ShieldAlert,
            },
          ].map((stat) => {
            const Icon = stat.icon;

            return (
              <article
                key={stat.label}
                className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-5 transition hover:border-emerald-400/20"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-400">{stat.label}</p>
                  <div className="rounded-xl bg-emerald-400/10 p-3 text-emerald-300">
                    <Icon size={20} />
                  </div>
                </div>

                <p className="mt-4 text-3xl font-black">{stat.value}</p>
                <p className="mt-1 text-xs text-zinc-500">{stat.note}</p>
              </article>
            );
          })}
        </section>

        {/* Player directory */}
        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/50">
          <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                Squad directory
              </p>
              <h2 className="mt-2 text-xl font-bold">Your players</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {visiblePlayers.length} of {players.length} players shown
              </p>
            </div>

            <button type="button" onClick={openCreate} className={primaryButton}>
              <Plus size={18} />
              Add player
            </button>
          </div>

          {/* Search and filters */}
          <div className="grid gap-3 border-y border-white/[0.08] bg-zinc-950/50 p-4 sm:p-5 lg:grid-cols-[1.4fr_1fr_1fr]">
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 px-3">
              <Search size={17} className="shrink-0 text-zinc-500" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search players or playing style..."
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder:text-zinc-600"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={16} className="text-zinc-500" />
                </button>
              )}
            </label>

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={inputClass}
            >
              <option value="all">All statuses</option>
              <option value="active">Active players</option>
              <option value="inactive">Inactive players</option>
            </select>

            <select
              aria-label="Filter by player role"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className={inputClass}
            >
              <option value="all">All playing roles</option>
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  {[
                    "Player",
                    "Age",
                    "Playing role",
                    "Batting style",
                    "Bowling style",
                    "Status",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="border-b border-white/[0.07] px-4 py-4 first:pl-6 last:pr-6"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center">
                      <LoaderCircle
                        size={25}
                        className="mx-auto animate-spin text-emerald-400"
                      />
                      <p className="mt-3 text-sm text-zinc-500">
                        Loading players...
                      </p>
                    </td>
                  </tr>
                ) : visiblePlayers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-14 text-center">
                      <Users
                        size={28}
                        className="mx-auto text-zinc-600"
                      />
                      <p className="mt-3 text-sm font-semibold text-zinc-300">
                        No players found
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Change your filters or add a player to your squad.
                      </p>
                    </td>
                  </tr>
                ) : (
                  visiblePlayers.map((player) => (
                    <tr
                      key={player._id}
                      className="border-b border-white/[0.05] transition hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-xs font-black text-emerald-300">
                            {getInitials(player.name)}
                          </div>
                          <span className="font-semibold text-white">
                            {player.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm text-zinc-400">
                        {player.age ?? "—"}
                      </td>

                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1.5 text-xs font-medium text-emerald-300">
                          {getRoleLabel(player.role)}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-sm text-zinc-400">
                        {player.battingStyle === "left-handed"
                          ? "Left-handed"
                          : "Right-handed"}
                      </td>

                      <td className="px-4 py-4 text-sm text-zinc-400">
                        {player.bowlingStyle || "—"}
                      </td>

                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              player.isActive
                                ? "bg-emerald-400"
                                : "bg-zinc-600"
                            }`}
                          />
                          {player.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-4 py-4 pr-6">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={!player.isActive || saving}
                            onClick={() => openEdit(player)}
                            title="Edit player"
                            aria-label={`Edit ${player.name}`}
                            className="rounded-lg p-2 text-zinc-400 transition hover:bg-emerald-400/10 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Edit3 size={16} />
                          </button>

                          {player.isActive && (
                            <button
                              type="button"
                              disabled={deletingId === player._id}
                              onClick={() => deactivatePlayer(player)}
                              title="Deactivate player"
                              aria-label={`Deactivate ${player.name}`}
                              className="rounded-lg p-2 text-zinc-400 transition hover:bg-red-400/10 hover:text-red-300 disabled:opacity-40"
                            >
                              {deletingId === player._id ? (
                                <LoaderCircle
                                  size={16}
                                  className="animate-spin"
                                />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 px-5 py-4 text-xs text-zinc-500 sm:flex-row sm:justify-between">
            <span>Showing {visiblePlayers.length} of {players.length} players</span>
            <span className="text-emerald-300/70">
              Built for the love of cricket.
            </span>
          </div>
        </section>
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              closeModal();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-modal-title"
            className="my-auto w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                  {editing ? "Update roster" : "New roster entry"}
                </p>
                <h2
                  id="player-modal-title"
                  className="mt-2 text-2xl font-black"
                >
                  {editing ? "Edit player" : "Add a player"}
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Enter the player's details and playing role.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close form"
                className="rounded-xl border border-white/10 p-2 text-zinc-400 transition hover:text-white disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitForm} className="grid gap-4 pt-5">
              <label className="grid gap-2 text-sm font-medium text-zinc-300">
                Player name <span className="inline text-emerald-300">*</span>
                <input
                  className={inputClass}
                  name="name"
                  value={form.name}
                  onChange={updateForm}
                  minLength={2}
                  maxLength={100}
                  placeholder="e.g. Rahul Sharma"
                  autoComplete="off"
                  required
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium text-zinc-300">
                  Age
                  <input
                    className={inputClass}
                    type="number"
                    name="age"
                    value={form.age}
                    onChange={updateForm}
                    min="5"
                    max="100"
                    step="1"
                    placeholder="e.g. 25"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium text-zinc-300">
                  Playing role <span className="inline text-emerald-300">*</span>
                  <select
                    className={inputClass}
                    name="role"
                    value={form.role}
                    onChange={updateForm}
                    required
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium text-zinc-300">
                Batting style
                <select
                  className={inputClass}
                  name="battingStyle"
                  value={form.battingStyle}
                  onChange={updateForm}
                >
                  <option value="right-handed">Right-handed</option>
                  <option value="left-handed">Left-handed</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-zinc-300">
                Bowling style
                <input
                  className={inputClass}
                  name="bowlingStyle"
                  value={form.bowlingStyle}
                  onChange={updateForm}
                  maxLength={50}
                  placeholder="e.g. Fast, Off-spin, Leg-spin"
                />
              </label>

              <div className="rounded-xl border border-white/[0.08] bg-zinc-950/70 p-3 text-xs leading-5 text-zinc-500">
                Wicket Keeper is a separate playing role. You can also record
                the player's batting and bowling styles above.
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-300"
                >
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={primaryButton}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <LoaderCircle size={17} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={17} />
                      {editing ? "Save changes" : "Create player"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
