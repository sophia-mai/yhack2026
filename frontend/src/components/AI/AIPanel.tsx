import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { streamAISummary } from '../../api/client';

export default function AIPanel() {
  const { simulationResult, activeInterventions, interventions, objective } = useStore();
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const canGenerate = !!simulationResult && !isStreaming;

  function handleGenerate() {
    if (!simulationResult || isStreaming) return;
    setText('');
    setIsStreaming(true);

    const enrichedInterventions = activeInterventions.map(ai => {
      const def = interventions.find(i => i.id === ai.id);
      return { ...ai, name: def?.name ?? ai.id, icon: def?.icon ?? '' };
    });

    streamAISummary(
      {
        simulationSummary: simulationResult.summary as unknown as Record<string, unknown>,
        interventions: enrichedInterventions,
        objective,
        countyCount: simulationResult.summary.countiesAnalyzed,
      },
      (chunk) => {
        setText(prev => prev + chunk);
        // Auto-scroll
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      },
      () => { setIsStreaming(false); setHasLoaded(true); },
      (err) => { setIsStreaming(false); setText(prev => prev + `\n\n⚠️ Error: ${err}`); }
    );
  }

  // Auto-generate when simulation runs
  useEffect(() => {
    if (simulationResult && !hasLoaded) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationResult]);

  // Reset when sim changes
  useEffect(() => {
    setHasLoaded(false);
    setText('');
  }, [simulationResult]);

  // Format markdown-ish text
  function formatText(t: string) {
    return t
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/##\s(.+)/g, '<br/><strong style="color:var(--text-primary);font-size:13px">$1</strong><br/>')
      .replace(/\d+\.\s\*\*(.*?)\*\*/g, '<br/><strong>$1</strong>')
      .replace(/- /g, '• ');
  }

  return (
    <div className="ai-panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="panel-title">🤖 AI Policy Analyst</div>
            <div className="panel-subtitle">GPT-4.5 · Simulation insights</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {hasLoaded && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(text)}>
                Copy
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleGenerate}
              disabled={!canGenerate}
              id="ai-generate-btn"
            >
              {isStreaming ? '…' : '↺ Generate'}
            </button>
          </div>
        </div>
        {isStreaming && <div className="loading-bar" style={{ marginTop: 8 }} />}
      </div>

      <div className="ai-content" ref={contentRef}>
        {!simulationResult && !isStreaming && (
          <div className="ai-placeholder">
            <div className="ai-placeholder-icon">🧬</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
              AI Summary Pending
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              Run a simulation to get GPT-4.5 powered policy insights, equity analysis, and recommendations.
            </div>
          </div>
        )}

        {(text || isStreaming) && (
          <div
            dangerouslySetInnerHTML={{ __html: formatText(text) }}
            style={{ whiteSpace: 'pre-wrap' }}
          />
        )}

        {isStreaming && <span className="ai-typing-cursor" />}
      </div>
    </div>
  );
}
