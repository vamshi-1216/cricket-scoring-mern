import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, AlertCircle, Check, ChevronRight, LoaderCircle, MapPin,
  Plus, RefreshCw, Search, ShieldCheck, ShieldX, Trash2, Trophy, Users, X,
  Edit3, CircleHelp, UserPlus, UserRound, CheckCheck, UserMinus, RotateCcw, ListChecks
} from "lucide-react";

const API_URL = import.meta.env.VITE_TEAM_API_URL || "http://localhost:4004/api/v1/teams";
const PLAYER_API_URL = import.meta.env.VITE_PLAYER_API_URL || "http://localhost:4002/api/v1/players";
const EMPTY_FORM = { name: "", shortName: "", homeGround: "" };

const inputClass = "w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 hover:border-white/20 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/10";

/* ---------- Button system ---------- */
const BTN_BASE = "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-40";
const BTN_VARIANTS = {
  primary: "bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/10 hover:bg-emerald-300 hover:shadow-emerald-400/20",
  secondary: "border border-white/10 bg-white/[0.03] text-zinc-200 hover:border-white/20 hover:bg-white/[0.07] hover:text-white",
  accent: "border border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300 hover:border-emerald-400/40 hover:bg-emerald-400/[0.14]",
  danger: "border border-red-400/20 bg-red-400/[0.05] text-red-300 hover:border-red-400/40 hover:bg-red-400/[0.14]",
  dangerSolid: "bg-red-500 text-white hover:bg-red-400",
  ghost: "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
};
const BTN_SIZES = {
  sm: "rounded-lg px-2.5 py-1.5 text-xs",
  md: "rounded-xl px-4 py-2.5 text-sm",
  lg: "rounded-xl px-5 py-3 text-sm",
  icon: "h-9 w-9 rounded-lg text-sm",
};

function Button({ variant = "secondary", size = "md", loading = false, className = "", children, disabled, type = "button", ...props }) {
  return <button type={type} disabled={disabled || loading} className={`${BTN_BASE} ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`} {...props}>
    {loading && <LoaderCircle size={size === "sm" ? 13 : 16} className="animate-spin" />}
    {children}
  </button>;
}

/* ---------- API helpers ---------- */
async function apiRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
  } catch {
    throw new Error("Cannot connect to Team Service. Make sure it is running on port 4004.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || result.error?.message || `Request failed (${response.status}).`);
  }
  return result;
}

function readTeams(result) {
  for (const value of [result?.data?.teams, result?.data?.items, result?.data?.results, result?.data, result?.teams]) {
    if (Array.isArray(value)) return value;
  }
  return [];
}
const idOf = (team) => team?._id || team?.id || "";
const nameOf = (team) => team?.name || team?.teamName || "Unnamed team";
const activeOf = (team) => team?.isActive !== false;
const playerIdOf = (p) => String(p?._id || p?.id || p || "");
const playerNameOf = (p) => p?.name || p?.fullName || p?.playerName || "Unnamed player";
const playerRoleOf = (p) => p?.role || p?.playingRole || "Player";

function Field({ label, hint, children }) {
  return <label className="block">
    <span className="mb-2 block text-sm font-medium text-zinc-200">{label}</span>
    {children}
    {hint && <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>}
  </label>;
}

/* Close a dialog with the Escape key */
function useEscape(active, handler) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === "Escape") handler(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, handler]);
}

/* In-app confirm dialog (replaces window.confirm) */
function ConfirmDialog({ config, onCancel }) {
  const [working, setWorking] = useState(false);
  useEscape(!!config, onCancel);
  if (!config) return null;
  async function run() {
    setWorking(true);
    try { await config.onConfirm(); } finally { setWorking(false); }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !working) onCancel(); }}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl border ${config.danger ? "border-red-400/20 bg-red-400/10 text-red-300" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"}`}>
        {config.danger ? <AlertCircle size={20} /> : <RotateCcw size={20} />}
      </div>
      <h2 id="confirm-title" className="text-lg font-bold">{config.title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{config.body}</p>
      <div className="mt-6 flex gap-3">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel} disabled={working}>Cancel</Button>
        <Button variant={config.danger ? "dangerSolid" : "primary"} size="lg" className="flex-1" onClick={run} loading={working}>{config.confirmLabel}</Button>
      </div>
    </section>
  </div>;
}

export default function Teams() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // active | all | inactive
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [playerTeam, setPlayerTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [savingPlayers, setSavingPlayers] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const [confirm, setConfirm] = useState(null);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await apiRequest(API_URL);
      setTeams(readTeams(result));
    } catch (e) {
      setLoadError(e.message || "Unable to load teams.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  // Success messages dismiss themselves
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const activeCount = teams.filter(activeOf).length;
  const inactiveCount = teams.length - activeCount;

  const visibleTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams.filter((team) => {
      const active = activeOf(team);
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "inactive" && active) return false;
      return !q || [nameOf(team), team.shortName, team.homeGround, team.ground]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [teams, search, statusFilter]);

  /* ---------- Team form ---------- */
  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setError(""); setMessage(""); setModalOpen(true);
  }
  function openEdit(team) {
    setEditing(team);
    setForm({
      name: team.name || team.teamName || "",
      shortName: team.shortName || "",
      homeGround: team.homeGround || team.ground || "",
    });
    setError(""); setMessage(""); setModalOpen(true);
  }
  const closeModal = useCallback(() => {
    if (saving) return;
    setModalOpen(false); setEditing(null); setForm(EMPTY_FORM); setError("");
  }, [saving]);
  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitForm(event) {
    event.preventDefault(); setError(""); setMessage("");
    const name = form.name.trim();
    const shortName = form.shortName.trim().toUpperCase();
    if (!name || !shortName) return setError("Team name and short name are required.");
    if (shortName.length > 10) return setError("Short name must be 10 characters or fewer.");
    const payload = { name, shortName, homeGround: form.homeGround.trim() };
    const teamId = editing ? idOf(editing) : "";
    setSaving(true);
    try {
      await apiRequest(teamId ? `${API_URL}/${teamId}` : API_URL, {
        method: teamId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setModalOpen(false); setEditing(null); setForm(EMPTY_FORM);
      setMessage(teamId ? "Team updated successfully." : "Team created successfully.");
      await loadTeams();
    } catch (e) {
      setError(e.message || "Unable to save team.");
    } finally {
      setSaving(false);
    }
  }

  /* ---------- Player assignment ---------- */
  async function openPlayerAssignment(team) {
    setPlayerTeam(team);
    setPlayerSearch("");
    setSelectedPlayerIds([]);
    setPlayerError("");
    setPlayersLoading(true);
    try {
      const result = await apiRequest(PLAYER_API_URL);
      const records = result?.data?.players ?? result?.players ?? result?.data;
      if (!Array.isArray(records)) {
        throw new Error("Player Service response did not contain a player list.");
      }
      setPlayers(records);
    } catch (e) {
      setPlayerError(`${e.message || "Unable to load players."} Check that Player Service is running on port 4002 and that GET ${PLAYER_API_URL} works.`);
      setPlayers([]);
    } finally {
      setPlayersLoading(false);
    }
  }

  const closePlayerAssignment = useCallback((force = false) => {
    if (savingPlayers && force !== true) return;
    setPlayerTeam(null);
    setPlayers([]);
    setSelectedPlayerIds([]);
    setPlayerError("");
  }, [savingPlayers]);

  useEscape(modalOpen && !confirm, closeModal);
  useEscape(!!playerTeam && !confirm, closePlayerAssignment);

  function togglePlayer(playerId) {
    setSelectedPlayerIds((current) => current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : [...current, playerId]);
  }

  const assignedIds = useMemo(
    () => new Set((playerTeam?.playerIds || []).map(playerIdOf)),
    [playerTeam]
  );

  const availablePlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return players.filter((player) => {
      if (player.isActive === false) return false;
      if (!playerIdOf(player)) return false;
      const searchable = [playerNameOf(player), player.role, player.playingRole, player.battingStyle, player.bowlingStyle]
        .filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [players, playerSearch]);

  const selectableIds = useMemo(
    () => availablePlayers.map(playerIdOf).filter((id) => !assignedIds.has(id)),
    [availablePlayers, assignedIds]
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedPlayerIds.includes(id));

  function toggleSelectAll() {
    setSelectedPlayerIds((current) => allSelected
      ? current.filter((id) => !selectableIds.includes(id))
      : [...new Set([...current, ...selectableIds])]);
  }

  async function savePlayerAssignment() {
    if (!playerTeam || selectedPlayerIds.length === 0) {
      setPlayerError("Select at least one player to add.");
      return;
    }
    setSavingPlayers(true);
    setPlayerError("");
    setError("");
    setMessage("");
    try {
      await apiRequest(`${API_URL}/${idOf(playerTeam)}/players`, {
        method: "POST",
        body: JSON.stringify({ playerIds: selectedPlayerIds }),
      });
      setMessage(`Players added to ${nameOf(playerTeam)} successfully.`);
      closePlayerAssignment(true);
      await loadTeams();
    } catch (e) {
      setPlayerError(`${e.message || "Unable to assign players."} Confirm that POST ${API_URL}/${idOf(playerTeam)}/players is implemented in Team Service.`);
    } finally {
      setSavingPlayers(false);
    }
  }

  function askRemovePlayer(playerId, name) {
    setConfirm({
      title: "Remove player from team?",
      body: `${name} will be removed from ${nameOf(playerTeam)}. Their player profile will not be deleted.`,
      confirmLabel: "Remove player",
      danger: true,
      onConfirm: () => removePlayerFromTeam(playerId),
    });
  }

  async function removePlayerFromTeam(playerId) {
    if (!playerTeam) return;
    setSavingPlayers(true);
    setPlayerError("");
    try {
      await apiRequest(`${API_URL}/${idOf(playerTeam)}/players/${playerId}`, { method: "DELETE" });
      setMessage("Player removed from team successfully.");
      setConfirm(null);
      await loadTeams();
      const refreshed = await apiRequest(`${API_URL}/${idOf(playerTeam)}`);
      const updatedTeam = refreshed?.data?.team ?? refreshed?.data ?? refreshed?.team ?? playerTeam;
      setPlayerTeam(updatedTeam);
    } catch (e) {
      setConfirm(null);
      setPlayerError(`${e.message || "Unable to remove player."} Team Service must support DELETE ${API_URL}/${idOf(playerTeam)}/players/${playerId}.`);
    } finally {
      setSavingPlayers(false);
    }
  }

  /* ---------- Status change ---------- */
  function askChangeStatus(team) {
    const isActive = activeOf(team);
    setConfirm({
      title: isActive ? `Deactivate ${nameOf(team)}?` : `Reactivate ${nameOf(team)}?`,
      body: isActive
        ? "This team will no longer be available for new matches. You can reactivate it any time."
        : "This team will be available for match setup again.",
      confirmLabel: isActive ? "Deactivate" : "Reactivate",
      danger: isActive,
      onConfirm: () => changeStatus(team),
    });
  }

  async function changeStatus(team) {
    const teamId = idOf(team);
    if (!teamId) return setConfirm(null);
    const isActive = activeOf(team);
    setBusyId(teamId); setError(""); setMessage("");
    try {
      if (isActive) {
        await apiRequest(`${API_URL}/${teamId}`, { method: "DELETE" });
        setMessage(`${nameOf(team)} deactivated.`);
      } else {
        await apiRequest(`${API_URL}/${teamId}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
        setMessage(`${nameOf(team)} reactivated.`);
      }
      setConfirm(null);
      await loadTeams();
    } catch (e) {
      setConfirm(null);
      setError(e.message || "Unable to change team status.");
    } finally {
      setBusyId("");
    }
  }

  const filterTabs = [
    { key: "active", label: "Active", count: activeCount },
    { key: "inactive", label: "Inactive", count: inactiveCount },
    { key: "all", label: "All", count: teams.length },
  ];

  return <main className="min-h-screen bg-zinc-950 text-white">
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute -left-40 top-[35rem] h-96 w-96 rounded-full bg-teal-500/5 blur-3xl" />
    </div>
    <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"><Trophy size={22} /></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Game of Cricket</p><p className="text-sm text-zinc-500">Team management</p></div>
        </div>
        <Link to="/home" className={`${BTN_BASE} ${BTN_VARIANTS.secondary} ${BTN_SIZES.md}`}><ArrowLeft size={16} /> Back to Home</Link>
      </header>

      <section className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5 text-xs font-medium text-emerald-300"><ShieldCheck size={14} /> Your squads, your game</div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Manage <span className="text-emerald-300">Teams</span></h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400 sm:text-base">Create cricket squads, organize team details, and select active teams when setting up a match.</p>
        </div>
        <Button variant="primary" size="lg" onClick={openCreate}><Plus size={18} /> Create team</Button>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-5"><div className="flex items-center justify-between text-sm text-zinc-400">Total teams loaded <Users size={18} className="text-emerald-300" /></div><p className="mt-3 text-3xl font-semibold">{teams.length}</p><p className="mt-1 text-xs text-zinc-500">From Team Service</p></div>
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-5"><div className="flex items-center justify-between text-sm text-zinc-400">Active teams <ShieldCheck size={18} className="text-emerald-300" /></div><p className="mt-3 text-3xl font-semibold">{activeCount}</p><p className="mt-1 text-xs text-zinc-500">Available for match setup</p></div>
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-5"><div className="flex items-center justify-between text-sm text-zinc-400">Next step <Trophy size={18} className="text-emerald-300" /></div>
          <Button variant="accent" size="md" className="mt-3" onClick={() => navigate("/match-setup")}>Set up a match <ChevronRight size={16} /></Button>
          <p className="mt-2 text-xs text-zinc-500">Choose two active teams</p></div>
      </section>

      {(message || error || loadError) && <div role={error || loadError ? "alert" : "status"} className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${error || loadError ? "border-red-400/20 bg-red-400/[0.07] text-red-200" : "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200"}`}>
        {error || loadError ? <AlertCircle size={18} className="mt-0.5 shrink-0" /> : <Check size={18} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1 pt-0.5">{error || loadError || message}</div>
        {loadError && <Button variant="danger" size="sm" onClick={loadTeams}><RefreshCw size={13} /> Retry</Button>}
        <button type="button" onClick={() => { setMessage(""); setError(""); setLoadError(""); }} aria-label="Dismiss message" className="rounded-md p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"><X size={16} /></button>
      </div>}

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/50">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 lg:flex-row lg:items-center lg:justify-between sm:p-5">
          <div><h2 className="text-lg font-semibold">Your teams</h2><p className="mt-1 text-sm text-zinc-500">{visibleTeams.length} {visibleTeams.length === 1 ? "team" : "teams"} shown</p></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-60">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teams..." aria-label="Search teams" className={`${inputClass} py-2.5 pl-9 ${search ? "pr-9" : ""}`} />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 transition hover:bg-white/10 hover:text-white"><X size={14} /></button>}
            </label>
            <div role="tablist" aria-label="Filter teams by status" className="inline-flex rounded-xl border border-white/10 bg-zinc-950 p-1">
              {filterTabs.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={statusFilter === tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${statusFilter === tab.key ? "bg-emerald-400/15 text-emerald-300" : "text-zinc-400 hover:text-white"}`}>
                {tab.label}<span className={`rounded-full px-1.5 text-[11px] ${statusFilter === tab.key ? "bg-emerald-400/20" : "bg-white/[0.06] text-zinc-500"}`}>{tab.count}</span>
              </button>)}
            </div>
            <Button variant="secondary" onClick={loadTeams} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</Button>
          </div>
        </div>

        {loading ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5" aria-busy="true" aria-label="Loading teams">
          {[0, 1, 2].map((i) => <div key={i} className="h-52 animate-pulse rounded-2xl border border-white/[0.06] bg-zinc-950/60" />)}
        </div>
        : visibleTeams.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-400"><Users size={25} /></div>
          <h3 className="text-base font-semibold">{search ? "No matching teams" : statusFilter === "inactive" ? "No inactive teams" : "No teams to display"}</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">{search ? "Try another team name, short name, or ground." : statusFilter === "inactive" ? "Deactivated teams will show up here." : "Create your first team to organize your cricket matches."}</p>
          <div className="mt-5 flex gap-2">
            {search && <Button variant="secondary" onClick={() => setSearch("")}><X size={15} /> Clear search</Button>}
            {!search && statusFilter !== "inactive" && <Button variant="primary" onClick={openCreate}><Plus size={16} /> Create your first team</Button>}
            {!search && statusFilter === "inactive" && <Button variant="secondary" onClick={() => setStatusFilter("all")}>Show all teams</Button>}
          </div>
        </div>
        : <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
          {visibleTeams.map((team) => {
            const teamId = idOf(team), active = activeOf(team), busy = busyId === teamId;
            return <article key={teamId || `${nameOf(team)}-${team.shortName}`} className={`flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-950/70 p-4 transition hover:border-emerald-400/25 ${active ? "" : "opacity-80"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.08] text-sm font-black tracking-wide text-emerald-300">{(team.shortName || nameOf(team).slice(0, 3)).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate font-semibold">{nameOf(team)}</h3><p className="mt-1 text-xs text-zinc-500">{team.shortName || "No short name"}</p></div></div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${active ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300" : "border-zinc-600/40 bg-zinc-700/20 text-zinc-400"}`}>{active ? <ShieldCheck size={12} /> : <ShieldX size={12} />} {active ? "Active" : "Inactive"}</span>
              </div>
              <div className="mt-5 flex min-h-6 items-center gap-2 text-sm text-zinc-400"><MapPin size={15} className="shrink-0 text-zinc-500" /><span className="truncate">{team.homeGround || team.ground || "Home ground not set"}</span></div>
              <div className="mt-3 flex items-center gap-2 text-sm text-zinc-400"><Users size={15} className="shrink-0 text-zinc-500" /><span>{Array.isArray(team.playerIds) ? team.playerIds.length : 0} players assigned</span></div>
              <div className="mt-auto flex gap-2 border-t border-white/[0.07] pt-4 mt-5">
                <Button variant="accent" className="flex-1" onClick={() => openPlayerAssignment(team)} disabled={!active} title={active ? "Add players to this team" : "Reactivate the team to add players"}><UserPlus size={15} /> Add players</Button>
                <Button variant="secondary" size="icon" onClick={() => openEdit(team)} title="Edit team" aria-label={`Edit ${nameOf(team)}`}><Edit3 size={15} /></Button>
                <Button variant={active ? "danger" : "accent"} size="icon" loading={busy} onClick={() => askChangeStatus(team)} title={active ? "Deactivate team" : "Reactivate team"} aria-label={`${active ? "Deactivate" : "Reactivate"} ${nameOf(team)}`}>
                  {!busy && (active ? <Trash2 size={15} /> : <RotateCcw size={15} />)}
                </Button>
              </div>
            </article>;
          })}
        </div>}
      </section>

      <footer className="mt-6 flex items-start gap-2 text-xs leading-5 text-zinc-500"><CircleHelp size={15} className="mt-0.5 shrink-0" /><p>Use Add players to load your Player Service records and assign players to a team. The same player can belong to multiple teams; duplicate assignment within a single team is prevented by the backend.</p></footer>
    </div>

    {/* ---------- Player assignment modal ---------- */}
    {playerTeam && <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closePlayerAssignment(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="players-modal-title" className="my-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Squad selection</p><h2 id="players-modal-title" className="mt-2 text-xl font-bold">Add players to {nameOf(playerTeam)}</h2><p className="mt-1 text-sm text-zinc-500">Choose existing player profiles. A player can be assigned to multiple teams.</p></div>
          <Button variant="ghost" size="icon" onClick={() => closePlayerAssignment()} disabled={savingPlayers} aria-label="Close player selection"><X size={18} /></Button></div>
        {playerError && <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-200"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span className="min-w-0 flex-1 break-words">{playerError}</span><button type="button" onClick={() => setPlayerError("")} aria-label="Dismiss error" className="h-fit rounded-md p-1 opacity-70 hover:bg-white/10 hover:opacity-100"><X size={14} /></button></div>}

        <div className="mb-4 rounded-xl border border-white/[0.08] bg-zinc-950/50 p-3">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-zinc-200">Current squad</h3><span className="text-xs text-zinc-500">{(playerTeam.playerIds || []).length} assigned</span></div>
          {(playerTeam.playerIds || []).length === 0 ? <p className="py-2 text-sm text-zinc-500">No players assigned yet.</p> : <div className="max-h-36 space-y-1 overflow-y-auto">{(playerTeam.playerIds || []).map((rawId) => {
            const assignedId = playerIdOf(rawId);
            const assignedPlayer = players.find((p) => playerIdOf(p) === assignedId);
            const assignedName = assignedPlayer ? playerNameOf(assignedPlayer) : "Player profile";
            const assignedRole = assignedPlayer ? playerRoleOf(assignedPlayer) : "Player";
            return <div key={assignedId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/[0.08] text-emerald-300"><UserRound size={15} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-100">{assignedName}</p><p className="text-xs text-zinc-500">{assignedRole}</p></div>
              <Button variant="danger" size="sm" onClick={() => askRemovePlayer(assignedId, assignedName)} disabled={savingPlayers} title={`Remove ${assignedName} from team`}><UserMinus size={13} /> Remove</Button></div>;
          })}</div>}
        </div>

        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" /><input value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Search players by name or role..." aria-label="Search players" className={`${inputClass} pl-9`} /></label>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="md" onClick={toggleSelectAll} disabled={selectableIds.length === 0 || savingPlayers}><ListChecks size={15} /> {allSelected ? "Clear all" : "Select all"}</Button>
            <span className="min-w-[5rem] text-right text-sm text-zinc-400">{selectedPlayerIds.length} selected</span>
          </div>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto rounded-xl border border-white/[0.08] bg-zinc-950/60">
          {playersLoading ? <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-zinc-400"><LoaderCircle size={18} className="animate-spin text-emerald-300" />Loading players from Player Service...</div>
          : availablePlayers.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center"><UserRound size={24} className="mb-3 text-zinc-500" /><p className="text-sm font-medium text-zinc-300">{players.length === 0 ? "No players loaded" : "No matching active players"}</p><p className="mt-1 max-w-md text-xs leading-5 text-zinc-500">{players.length === 0 ? "Create players first in Player Management. If players already exist, check the Player Service API URL and response format." : "Try a different search term."}</p>
            <div className="mt-4 flex gap-2">
              {players.length === 0 && playerError && <Button variant="secondary" size="sm" onClick={() => openPlayerAssignment(playerTeam)}><RefreshCw size={13} /> Try again</Button>}
              <Button variant="accent" size="sm" onClick={() => navigate("/players")}>Open Player Management <ChevronRight size={13} /></Button>
            </div></div>
          : <div className="divide-y divide-white/[0.06]">{availablePlayers.map((player) => {
            const playerId = playerIdOf(player);
            const assigned = assignedIds.has(playerId);
            const checked = selectedPlayerIds.includes(playerId);
            return <label key={playerId} className={`flex items-center gap-3 px-4 py-3 transition ${assigned ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-white/[0.03]"} ${checked ? "bg-emerald-400/[0.06]" : ""}`}><input type="checkbox" checked={checked} disabled={assigned || savingPlayers} onChange={() => togglePlayer(playerId)} className="h-4 w-4 accent-emerald-400" /><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.08] text-emerald-300"><UserRound size={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-100">{playerNameOf(player)}</p><p className="mt-1 truncate text-xs text-zinc-500">{playerRoleOf(player)}</p></div>{assigned ? <span className="rounded-full border border-zinc-600/40 px-2 py-1 text-[11px] text-zinc-400">Already on this team</span> : checked ? <CheckCheck size={18} className="text-emerald-300" /> : null}</label>;
          })}</div>}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-zinc-500">Player IDs are stored on the team; profiles are not duplicated.</p>
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" onClick={() => closePlayerAssignment()} disabled={savingPlayers}>Cancel</Button>
            <Button variant="primary" size="lg" onClick={savePlayerAssignment} loading={savingPlayers} disabled={playersLoading || selectedPlayerIds.length === 0}>
              {!savingPlayers && <UserPlus size={16} />} {savingPlayers ? "Adding players..." : selectedPlayerIds.length ? `Add ${selectedPlayerIds.length} player${selectedPlayerIds.length === 1 ? "" : "s"}` : "Add players"}
            </Button>
          </div></div>
      </section>
    </div>}

    {/* ---------- Team form modal ---------- */}
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="team-modal-title" className="my-auto w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl sm:p-6">
        <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Team details</p><h2 id="team-modal-title" className="mt-2 text-xl font-bold">{editing ? "Edit team" : "Create a team"}</h2><p className="mt-1 text-sm text-zinc-500">Enter the squad details below.</p></div>
          <Button variant="ghost" size="icon" onClick={closeModal} disabled={saving} aria-label="Close team form"><X size={18} /></Button></div>
        {error && <div role="alert" className="mb-4 flex gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-200"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
        <form onSubmit={submitForm} className="space-y-4">
          <Field label="Team name *" hint="Example: Nagole Strikers"><input name="name" value={form.name} onChange={updateField} required maxLength={80} autoFocus placeholder="Enter team name" className={inputClass} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Short name *" hint={`${form.shortName.length}/10 characters`}><input name="shortName" value={form.shortName} onChange={updateField} required maxLength={10} placeholder="e.g. NS" className={`${inputClass} uppercase`} /></Field>
            <Field label="Home ground"><input name="homeGround" value={form.homeGround} onChange={updateField} maxLength={120} placeholder="e.g. Nagole Cricket Ground" className={inputClass} /></Field>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" size="lg" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" size="lg" loading={saving}>{!saving && <Check size={16} />} {saving ? "Saving..." : editing ? "Save changes" : "Create team"}</Button>
          </div>
        </form>
      </section>
    </div>}

    <ConfirmDialog config={confirm} onCancel={() => setConfirm(null)} />
  </main>;
}