import { useState } from "react";

import { useNavigate } from "react-router-dom";

import {

  Activity,

  ArrowDownRight,

  ArrowRight,

  ArrowUpRight,

  BarChart3,

  CalendarDays,

  ChevronRight,

  CirclePlus,

  Clock3,

  LogOut,

  Menu,

  Shield,

  Trophy,

  Users,

  X,

  Zap,

} from "lucide-react";

const quickActions = [

  {

    title: "Create a match",

    description: "Set up a new game and start scoring.",

    icon: CirclePlus,

    accent: "text-emerald-400",

    iconBg: "bg-emerald-400/10",

  },

  {

    title: "Manage teams",

    description: "Organize your squads and players.",

    icon: Users,

    accent: "text-sky-400",

    iconBg: "bg-sky-400/10",

  },

  {

    title: "Match history",

    description: "Revisit your previous scorecards.",

    icon: Clock3,

    accent: "text-amber-400",

    iconBg: "bg-amber-400/10",

  },

  {

    title: "Player statistics",

    description: "Explore runs, wickets and records.",

    icon: BarChart3,

    accent: "text-violet-400",

    iconBg: "bg-violet-400/10",

  },

];

const upcomingMatches = [

  {

    id: 1,

    competition: "YOUR NEXT GAME",

    title: "Ready for the toss?",

    description: "Create a match to get your scoreboard started.",

    date: "No match scheduled",

  },

];

function Brand() {

  return (

    <div className="flex items-center gap-3">

      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400 text-sm font-black text-zinc-950 shadow-lg shadow-emerald-400/10">

        CS

      </div>

      <div>

        <p className="text-sm font-black tracking-wide text-white">

          CRICKET<span className="text-emerald-400">.SCORING</span>

        </p>

        <p className="mt-0.5 text-[10px] tracking-[0.24em] text-zinc-500">

          YOUR GAME. YOUR LEGACY.

        </p>

      </div>

    </div>

  );

}

function SectionHeading({ eyebrow, title, action }) {

  return (

    <div className="mb-5 flex items-end justify-between gap-3">

      <div>

        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">

          {eyebrow}

        </p>

        <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">

          {title}

        </h2>

      </div>

      {action}

    </div>

  );

}

export default function Home({ user, onLogout }) {

  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = useNavigate();

  const displayName =

    user?.name?.trim()?.split(/\s+/)[0] || "Champion";

 function handleAction(title) {

  if (title === "Manage teams") {

    navigate("/teams");

    return;

  }

  if (title === "Player statistics") {

    navigate("/players");

    return;

  }

  if (title === "Create a match") {

    navigate("/match-setup");

    return;

  }

  if (title === "Match history") {

    window.alert("Match history is coming next!");

  }

}

  function openPlayers() {

    setMenuOpen(false);

    navigate("/players");

  }

  function openTeams() {
    setMenuOpen(false);
    navigate("/teams");
  }

  return (

    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">

      {/* Background glow */}

      <div className="pointer-events-none absolute -left-48 -top-48 h-[450px] w-[450px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />

      <div className="pointer-events-none absolute -right-48 top-[35%] h-[400px] w-[400px] rounded-full bg-green-500/[0.05] blur-[120px]" />

      {/* Navigation */}

      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-zinc-950/85 backdrop-blur-xl">

        <nav className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">

          <Brand />

          <div className="hidden items-center gap-7 md:flex">

            <a

              href="#overview"

              className="text-sm font-medium text-white transition hover:text-emerald-400"

            >

              Overview

            </a>

            <a

              href="#quick-actions"

              className="text-sm font-medium text-zinc-400 transition hover:text-white"

            >

              Quick actions

            </a>

            <a

              href="#matches"

              className="text-sm font-medium text-zinc-400 transition hover:text-white"

            >

              Matches

            </a>

            <button
                type="button"
                onClick={openTeams}
                className="text-sm font-medium text-zinc-400 transition hover:text-emerald-400"
              >
                Team Management
              </button>
              <button

              type="button"

              onClick={openPlayers}

              className="text-sm font-medium text-zinc-400 transition hover:text-emerald-400"

            >

              Players

            </button>

          </div>

          <div className="hidden items-center gap-3 md:flex">

            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/10 text-sm font-bold text-emerald-300">

              {displayName.charAt(0).toUpperCase()}

            </div>

            <div className="max-w-32">

              <p className="truncate text-sm font-semibold text-white">

                {displayName}

              </p>

              <p className="text-xs text-zinc-500">Cricket player</p>

            </div>

            <button

              type="button"

              onClick={onLogout}

              className="ml-2 rounded-xl border border-white/10 p-2.5 text-zinc-400 transition hover:border-red-400/30 hover:text-red-300"

              title="Log out"

              aria-label="Log out"

            >

              <LogOut size={17} />

            </button>

          </div>

          <button

            type="button"

            onClick={() => setMenuOpen((open) => !open)}

            className="rounded-xl border border-white/10 p-2.5 text-zinc-300 md:hidden"

            aria-label={menuOpen ? "Close menu" : "Open menu"}

          >

            {menuOpen ? <X size={20} /> : <Menu size={20} />}

          </button>

        </nav>

        {menuOpen && (

          <div className="border-t border-white/10 bg-zinc-950 px-5 py-4 md:hidden">

            <div className="mx-auto flex max-w-7xl flex-col gap-4">

              <a

                href="#overview"

                onClick={() => setMenuOpen(false)}

                className="text-sm text-zinc-300"

              >

                Overview

              </a>

              <a

                href="#quick-actions"

                onClick={() => setMenuOpen(false)}

                className="text-sm text-zinc-300"

              >

                Quick actions

              </a>

              <a

                href="#matches"

                onClick={() => setMenuOpen(false)}

                className="text-sm text-zinc-300"

              >

                Matches

              </a>

              <button
                  type="button"
                  onClick={openTeams}
                  className="text-left text-sm text-emerald-300"
                >
                  Team Management
                </button>
                <button

                type="button"

                onClick={openPlayers}

                className="text-left text-sm text-emerald-300"

              >

                Players

              </button>

              <button

                type="button"

                onClick={onLogout}

                className="flex items-center gap-2 text-left text-sm text-red-300"

              >

                <LogOut size={16} /> Log out

              </button>

            </div>

          </div>

        )}

      </header>

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:px-12">

        {/* Welcome */}

        <section id="overview" className="mb-9">

          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">

            <div>

              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1.5">

                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">

                  Your cricket journey starts here

                </span>

              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">

                Welcome back,

                <span className="mt-1 block text-emerald-400">

                  {displayName}.

                </span>

              </h1>

              <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">

                Every run tells a story. Build your teams, own the scoreboard,

                and keep your cricket legacy alive.

              </p>

            </div>

            <button

              type="button"

              onClick={() => handleAction("Create a match")}

              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-zinc-950"

            >

              <CirclePlus size={18} />

              Create a match

              <ArrowRight size={16} />

            </button>

          </div>

        </section>

        {/* Feature banner */}

        <section className="relative mb-10 overflow-hidden rounded-3xl border border-emerald-400/15 bg-gradient-to-br from-emerald-950/60 via-zinc-900 to-zinc-900 p-6 sm:p-9 lg:p-10">

          <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border border-emerald-400/[0.08]" />

          <div className="pointer-events-none absolute -right-1 -top-10 h-48 w-48 rounded-full border border-emerald-400/[0.10]" />

          <div className="pointer-events-none absolute -bottom-24 right-20 h-48 w-48 rounded-full bg-emerald-400/[0.07] blur-3xl" />

          <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_0.6fr]">

            <div>

              <div className="mb-4 flex items-center gap-2 text-emerald-300">

                <Zap size={16} />

                <span className="text-[10px] font-bold uppercase tracking-[0.25em]">

                  Made for every kind of cricket

                </span>

              </div>

              <h2 className="max-w-xl text-2xl font-black leading-tight sm:text-3xl lg:text-4xl">

                From the first ball

                <span className="text-emerald-400"> to the final over.</span>

              </h2>

              <p className="mt-4 max-w-lg text-sm leading-7 text-zinc-400">

                Gully cricket, friendly matches, or your weekend tournament.

                Keep every score and performance in one place.

              </p>

              <button

                type="button"

                onClick={() => handleAction("Create a match")}

                className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-emerald-300 transition hover:text-emerald-200"

              >

                Start your next match <ArrowRight size={16} />

              </button>

            </div>

            <div className="relative hidden lg:flex lg:justify-center">

              <div className="flex h-48 w-48 items-center justify-center rounded-full border border-emerald-400/15 bg-black/20">

                <div className="flex h-36 w-36 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.06]">

                  <Trophy

                    size={66}

                    strokeWidth={1.1}

                    className="text-emerald-300"

                  />

                </div>

              </div>

              <div className="absolute bottom-1 right-2 rounded-xl border border-white/10 bg-zinc-900/90 px-4 py-3 shadow-xl">

                <p className="text-[10px] uppercase tracking-widest text-zinc-500">

                  Your next milestone

                </p>

                <p className="mt-1 text-sm font-bold text-white">

                  Make history.

                </p>

              </div>

            </div>

          </div>

        </section>

        {/* Stats overview */}

        <section className="mb-11">

          <SectionHeading eyebrow="Your numbers" title="Career overview" />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">

            {[

              {

                label: "Matches played",

                value: "—",

                note: "Your match history",

                icon: Activity,

                color: "text-emerald-400",

                bg: "bg-emerald-400/10",

                trend: ArrowUpRight,

              },

              {

                label: "Runs scored",

                value: "—",

                note: "Your batting record",

                icon: Zap,

                color: "text-amber-400",

                bg: "bg-amber-400/10",

                trend: ArrowUpRight,

              },

              {

                label: "Wickets taken",

                value: "—",

                note: "Your bowling record",

                icon: Shield,

                color: "text-sky-400",

                bg: "bg-sky-400/10",

                trend: ArrowDownRight,

              },

              {

                label: "Teams created",

                value: "—",

                note: "Your squads",

                icon: Users,

                color: "text-violet-400",

                bg: "bg-violet-400/10",

                trend: ArrowUpRight,

              },

            ].map((stat) => {

              const Icon = stat.icon;

              const Trend = stat.trend;

              return (

                <div

                  key={stat.label}

                  className="group rounded-2xl border border-white/[0.08] bg-zinc-900/70 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400/20 sm:p-5"

                >

                  <div className="mb-5 flex items-center justify-between">

                    <div

                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg}`}

                    >

                      <Icon size={19} className={stat.color} />

                    </div>

                    <Trend

                      size={17}

                      className="text-zinc-600 transition group-hover:text-emerald-400"

                    />

                  </div>

                  <p className="text-2xl font-black tracking-tight text-white sm:text-3xl">

                    {stat.value}

                  </p>

                  <p className="mt-2 text-xs font-semibold text-zinc-300 sm:text-sm">

                    {stat.label}

                  </p>

                  <p className="mt-1 text-[10px] leading-5 text-zinc-500 sm:text-xs">

                    {stat.note}

                  </p>

                </div>

              );

            })}

          </div>

        </section>

        {/* Quick actions */}

        <section id="quick-actions" className="mb-11">

          <SectionHeading

            eyebrow="Make your move"

            title="Quick actions"

            action={

              <span className="hidden text-xs text-zinc-500 sm:block">

                Everything starts here

              </span>

            }

          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

            {quickActions.map((action, index) => {

              const Icon = action.icon;

              return (

                <button

                  key={action.title}

                  type="button"

                  onClick={() => handleAction(action.title)}

                  className="group flex min-h-44 flex-col rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-5 text-left transition duration-200 hover:-translate-y-1 hover:border-emerald-400/25 hover:bg-zinc-900 sm:p-6"

                >

                  <div className="mb-5 flex w-full items-center justify-between">

                    <div

                      className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.iconBg}`}

                    >

                      <Icon size={21} className={action.accent} />

                    </div>

                    <span className="text-xs font-semibold text-zinc-600">

                      0{index + 1}

                    </span>

                  </div>

                  <h3 className="text-sm font-bold text-white">

                    {action.title}

                  </h3>

                  <p className="mt-2 flex-1 text-xs leading-6 text-zinc-500">

                    {action.description}

                  </p>

                  <div className="mt-4 flex items-center justify-between">

                    <span className="text-xs font-semibold text-zinc-500 transition group-hover:text-emerald-300">

                      Explore

                    </span>

                    <ChevronRight

                      size={17}

                      className="text-zinc-600 transition group-hover:translate-x-1 group-hover:text-emerald-400"

                    />

                  </div>

                </button>

              );

            })}

          </div>

        </section>

        {/* Matches and profile */}

        <section

          id="matches"

          className="grid gap-5 lg:grid-cols-[1.5fr_0.8fr]"

        >

          <div>

            <SectionHeading

              eyebrow="Stay in the game"

              title="Your matches"

              action={

                <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold text-zinc-400">

                  Recent activity

                </span>

              }

            />

            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-5 sm:p-6">

              {upcomingMatches.map((match) => (

                <div key={match.id} className="flex items-start gap-4">

                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07]">

                    <Trophy size={21} className="text-emerald-300" />

                  </div>

                  <div className="min-w-0 flex-1">

                    <p className="text-[10px] font-bold tracking-[0.2em] text-emerald-400">

                      {match.competition}

                    </p>

                    <h3 className="mt-2 text-sm font-bold text-white">

                      {match.title}

                    </h3>

                    <p className="mt-2 text-xs leading-6 text-zinc-500">

                      {match.description}

                    </p>

                    <p className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">

                      <CalendarDays size={13} />

                      {match.date}

                    </p>

                  </div>

                </div>

              ))}

              <button

                type="button"

                onClick={() => handleAction("Create a match")}

                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-zinc-300 transition hover:border-emerald-400/30 hover:text-emerald-300"

              >

                Set up your first match <ArrowRight size={15} />

              </button>

            </div>

          </div>

          <div>

            <SectionHeading eyebrow="Your account" title="Player profile" />

            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-5 sm:p-6">

              <div className="flex items-center gap-4">

                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-400 text-xl font-black text-zinc-950">

                  {displayName.charAt(0).toUpperCase()}

                </div>

                <div className="min-w-0">

                  <h3 className="truncate text-sm font-bold text-white">

                    {user?.name || "Cricket player"}

                  </h3>

                  <p className="mt-1 truncate text-xs text-zinc-500">

                    {user?.email || user?.phone || "Account active"}

                  </p>

                </div>

              </div>

              <div className="my-5 border-t border-white/[0.07]" />

              <div className="flex items-center justify-between gap-3">

                <span className="text-xs text-zinc-500">

                  Account status

                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-bold text-emerald-300">

                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

                  Signed in

                </span>

              </div>

              <button

                type="button"

                onClick={openPlayers}

                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/20 px-4 py-3 text-xs font-bold text-emerald-300 transition hover:bg-emerald-400/[0.07]"

              >

                <Users size={15} /> Manage players

                <ArrowRight size={14} />

              </button>

              <button

                type="button"

                onClick={onLogout}

                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/15 px-4 py-3 text-xs font-bold text-red-300 transition hover:bg-red-400/[0.07]"

              >

                <LogOut size={15} /> Log out

              </button>

            </div>

          </div>

        </section>

        {/* Footer */}

        <footer className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/[0.07] py-6 sm:flex-row">

          <Brand />

          <p className="text-center text-[10px] text-zinc-600 sm:text-right">

            Built for the love of cricket. Every run matters.

          </p>

        </footer>

      </div>

    </main>

  );

}