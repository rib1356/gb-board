import { ChevronDown, ChevronRight } from 'lucide-react';
import { gradeOf, gradeLabel } from '../lib/problemList';
import { sessionsLabel } from '../lib/projects';
import { dayLabel } from '../lib/injuries';
import { sectionHeading, gradeBadgeStyle, provisionalBadgeStyle } from '../ui';

function ProjectRow({ project, today, onOpen }) {
  const { problem } = project;
  return (
    <button onClick={() => onOpen(problem.id)} style={{
      width: '100%', textAlign: 'left', background: '#232427', border: '1px solid #2A2B2E',
      borderRadius: 12, padding: '12px 16px', marginBottom: 8, cursor: 'pointer', color: '#EDEAE3',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: 15.5 }}>{problem.name}</span>
        <span style={{ display: 'block', fontSize: 12, color: '#8b8d91', marginTop: 2 }}>
          {`${sessionsLabel(project.sessions)} · last ${dayLabel(project.lastWorked, today)}`}
        </span>
      </span>
      {gradeOf(problem) && (
        <span style={problem.gradeProvisional ? provisionalBadgeStyle : gradeBadgeStyle}>{gradeLabel(problem)}</span>
      )}
    </button>
  );
}

// The picked climber's projects, a shortcut above the main list: active ones
// newest-worked first, then any that have gone cold, folded away. The heading
// folds the whole section, for when the list gets long.
export default function YourProjects({ active, cold, collapsed, onToggleCollapsed, coldOpen, onToggleCold, onOpenProblem, today }) {
  if (active.length === 0 && cold.length === 0) return null;
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <section aria-label="Your projects" style={{ marginBottom: 18 }}>
      <h2 style={{ ...sectionHeading, margin: collapsed ? 0 : sectionHeading.margin }}>
        <button aria-expanded={!collapsed} onClick={onToggleCollapsed} style={{
          display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '4px 0',
          color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer',
        }}>
          <Chevron size={14} aria-hidden="true" />
          {`Your projects (${active.length + cold.length})`}
        </button>
      </h2>
      {!collapsed && active.map((p) => <ProjectRow key={p.problem.id} project={p} today={today} onOpen={onOpenProblem} />)}
      {!collapsed && cold.length > 0 && (
        <>
          <button aria-expanded={coldOpen} onClick={onToggleCold} style={{
            display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#8b8d91',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 0', marginBottom: coldOpen ? 8 : 0,
          }}>
            <ChevronRight size={14} aria-hidden="true" style={{ transform: coldOpen ? 'rotate(90deg)' : 'none' }} />
            {`Gone cold (${cold.length})`}
          </button>
          {coldOpen && cold.map((p) => <ProjectRow key={p.problem.id} project={p} today={today} onOpen={onOpenProblem} />)}
        </>
      )}
    </section>
  );
}
