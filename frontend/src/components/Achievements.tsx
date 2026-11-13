// Badge visuals, levels, milestone bars and the watcher that celebrates new badges,
// levels and milestones (FR-43 – FR-46).

import { useEffect } from 'react';
import {
  CalendarCheck,
  Check,
  ClipboardList,
  Flag,
  Flame,
  Footprints,
  Lock,
  Medal,
  Mountain,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api, type Achievement, type AchievementId } from '../api';
import { formatDate } from '../lib/dates';
import { goalMilestones, levelOf, nextMilestone, type LevelInfo } from '../lib/achievements';
import { formatMoney, type Tiyn } from '../lib/money';
import { useLoad, useMember } from '../state/session';
import { Progress, useToast } from './ui';

const ICON: Record<AchievementId, LucideIcon> = {
  FIRST_STEP: Footprints,
  REGULAR: CalendarCheck,
  ON_A_ROLL: Flame,
  IN_THE_GREEN: TrendingUp,
  PLANNER: ClipboardList,
  BUDGET_KEEPER: ShieldCheck,
  POSITIVE_MONTH: Sparkles,
  TEAM_EFFORT: Users,
  DREAMER: Star,
  HALFWAY: Mountain,
  GOAL_REACHED: Trophy,
  CHALLENGE_CHAMPION: Medal,
};

export function BadgeIcon({ badge, size = 'md' }: { badge: Achievement; size?: 'sm' | 'md' }) {
  const Icon = ICON[badge.id];
  return (
    <span className={`badge-icon ${size} ${badge.earned ? 'earned' : 'locked'}`} aria-hidden>
      <Icon size={size === 'sm' ? 16 : 24} />
      {!badge.earned && (
        <span className="badge-lock">
          <Lock size={10} />
        </span>
      )}
    </span>
  );
}

export function BadgeCard({ badge }: { badge: Achievement }) {
  const { current, target } = badge.progress;
  return (
    <div className={`card badge-card ${badge.earned ? 'earned' : ''}`}>
      <BadgeIcon badge={badge} />
      <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <strong>{badge.title}</strong>
          <span className={`points-pill ${badge.earned ? 'earned' : ''}`}>+{badge.points} pts</span>
        </div>
        <span className="muted small">{badge.description}</span>
        {badge.earned ? (
          <span className="small earned-text">Earned{badge.earnedOn ? ` · ${formatDate(badge.earnedOn)}` : ''}</span>
        ) : target > 1 ? (
          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
            <Progress percent={(current * 100) / target} tone="goal" />
            <span className="muted small num">
              {current} of {target}
            </span>
          </div>
        ) : (
          <span className="muted small">Not earned yet</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- levels (FR-45)

/** The current member's level, loaded once per change. */
export function useLevel(): LevelInfo | null {
  const { data } = useLoad(() => api.achievements());
  return data ? levelOf(data) : null;
}

export function LevelChip({ level, dark }: { level: LevelInfo | null; dark?: boolean }) {
  if (!level) return null;
  return (
    <span className={`level-chip ${dark ? 'dark' : ''}`} title={`${level.points} points`}>
      <Star size={12} fill="currentColor" /> Lv {level.level} · {level.name}
    </span>
  );
}

export function LevelCard({ level, earned, total }: { level: LevelInfo; earned: number; total: number }) {
  return (
    <div className="card card-pad row trophy-head">
      <span className="trophy-mark level-mark">
        <span className="level-num">{level.level}</span>
        <span className="level-word">level</span>
      </span>
      <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
        <div className="row-between wrap">
          <strong style={{ fontSize: 18 }}>{level.name}</strong>
          <span className="muted small num">
            {level.points} pts · {earned} of {total} badges
          </span>
        </div>
        <Progress percent={level.percent} tone="goal" large />
        <span className="muted small">
          {level.nextAt !== null ? (
            <>
              <span className="num">{level.nextAt - level.points}</span> points to level {level.level + 1}, <strong>{level.nextName}</strong>
            </>
          ) : (
            'Top level reached. Well done!'
          )}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- milestones (FR-44, FR-46)

/** A goal or challenge bar with markers at 25, 50, 75 and 100 %. */
export function MilestoneBar({ saved, target }: { saved: Tiyn; target: Tiyn }) {
  const milestones = goalMilestones(saved, target);
  const percent = Math.floor((saved * 100) / target);
  return (
    <div className="milestones">
      <Progress percent={percent} tone="goal" large />
      <div className="milestone-marks" aria-hidden>
        {milestones.map((m) => (
          <span key={m.percent} className={`milestone ${m.reached ? 'reached' : ''}`} style={{ left: `${m.percent}%` }} title={`${m.percent} %: ${formatMoney(m.amount)}`}>
            {m.reached ? <Check size={11} strokeWidth={3} /> : null}
          </span>
        ))}
      </div>
      <div className="milestone-labels small muted num">
        {milestones.map((m) => (
          <span key={m.percent} className={m.reached ? 'reached' : ''} style={{ left: `${m.percent}%` }}>
            {m.percent} %
          </span>
        ))}
      </div>
    </div>
  );
}

export function NextMilestone({ saved, target }: { saved: Tiyn; target: Tiyn }) {
  const next = nextMilestone(saved, target);
  if (!next) return null;
  return (
    <div className="alert alert-info small" style={{ padding: '8px 12px' }}>
      <Flag size={15} />
      <span>
        Next milestone: <strong>{next.percent} %</strong>, <span className="num">{formatMoney(next.left)}</span> to go
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- celebrations

/** What this member has already been shown. Browser storage only; it can be missing (private window). */
function readSeen(key: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(key: string, seen: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...seen]));
  } catch {
    /* storage blocked: celebrations simply repeat next time */
  }
}

/**
 * After every change, compare earned badges, the level and reached goal or challenge milestones
 * with what this member has already seen, and celebrate the new ones. The first look only
 * remembers, so opening the app does not flood the screen with old news.
 */
export function Celebrations() {
  const { member, isGrownUp, version } = useMember();
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [badges, goals, challenges] = await Promise.all([api.achievements(), isGrownUp ? api.goals() : Promise.resolve([]), api.challenges()]);
        if (!alive) return;
        const current = new Map<string, string>();
        for (const b of badges) if (b.earned) current.set(`badge:${b.id}`, `New badge: ${b.title} (+${b.points} pts)`);
        const level = levelOf(badges);
        for (let l = 2; l <= level.level; l++) current.set(`level:${l}`, `Level up! You are now level ${level.level}, ${level.name}`);
        const progress = (kind: string, id: number, name: string, saved: Tiyn, target: Tiyn) => {
          for (const m of goalMilestones(saved, target)) {
            if (m.reached) current.set(`${kind}:${id}:${m.percent}`, m.percent === 100 ? `“${name}” reached its target!` : `“${name}” reached ${m.percent} %`);
          }
        };
        for (const g of goals) progress('goal', g.goalId, g.name, g.saved, g.targetAmount);
        for (const c of challenges) progress('challenge', c.challengeId, c.name, c.saved, c.targetAmount);

        const key = `fbt.celebrated.${member.memberId}`;
        const seen = readSeen(key);
        if (seen) {
          // One message per goal or challenge (its highest new milestone) and one per level-up.
          const latest = new Map<string, string>();
          for (const [k, text] of current) {
            if (seen.has(k)) continue;
            const group = k.startsWith('badge:') ? k : k.split(':').slice(0, k.startsWith('level:') ? 1 : 2).join(':');
            latest.set(group, text);
          }
          for (const text of latest.values()) toast(text, 'celebrate');
        }
        writeSeen(key, new Set([...(seen ?? []), ...current.keys()]));
      } catch {
        /* celebrations are a bonus; never break the screen */
      }
    })();
    return () => {
      alive = false;
    };
  }, [version, member.memberId, isGrownUp, toast]);

  return null;
}
