// FR-43, FR-45: achievement badges, points and levels. Personal badges for everyone, family badges for Owner and Adults (BR-30).

import { api } from '../api';
import { BadgeCard, LevelCard } from '../components/Achievements';
import { ErrorAlert, Skeleton } from '../components/ui';
import { levelOf, LEVELS } from '../lib/achievements';
import { useLoad, useMember } from '../state/session';

export function AchievementsPage() {
  const { isGrownUp } = useMember();
  const { data, error } = useLoad(() => api.achievements());

  const earned = data?.filter((b) => b.earned).length ?? 0;
  const total = data?.length ?? 0;
  const personal = data?.filter((b) => b.scope === 'PERSONAL') ?? [];
  const family = data?.filter((b) => b.scope === 'FAMILY') ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Achievements</h1>
          <p>Badges for good money habits give points, and points raise your level. They come from what you already record.</p>
        </div>
      </div>

      <ErrorAlert message={error} />

      {!data ? (
        <Skeleton height={220} />
      ) : (
        <div className="stack" style={{ gap: 28 }}>
          <LevelCard level={levelOf(data)} earned={earned} total={total} />
          <div className="level-ladder">
            {LEVELS.map((l) => (
              <span key={l.level} className={levelOf(data).level >= l.level ? 'on' : ''}>
                <strong>{l.level}</strong> {l.name} <em className="num">{l.from} pts</em>
              </span>
            ))}
          </div>

          <section>
            <div className="section-head">
              <h2>My badges</h2>
            </div>
            <div className="grid grid-2">
              {personal.map((b) => (
                <BadgeCard key={b.id} badge={b} />
              ))}
            </div>
          </section>

          {isGrownUp && (
            <section>
              <div className="section-head">
                <h2>Family badges</h2>
              </div>
              <div className="grid grid-2">
                {family.map((b) => (
                  <BadgeCard key={b.id} badge={b} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
