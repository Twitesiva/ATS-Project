import React, { useMemo } from "react";
import { Briefcase, CheckCircle2, Circle, XCircle } from "lucide-react";
import ResumePreviewModal from "./ResumePreviewModal";

// UI ENHANCEMENT – Enhanced Score Display with Quality Categories
function EnhancedMatchScore({ percentage, qualityCategory }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  const getScoreStyle = (category) => {
    switch (category) {
      case "Excellent Match":
        return {
          gradientId: "gradient-excellent",
          gradient: ["#10b981", "#059669"],
          bgColor: "#10b981",
          textColor: "white"
        };
      case "Good Match":
        return {
          gradientId: "gradient-good",
          gradient: ["#3b82f6", "#2563eb"],
          bgColor: "#3b82f6",
          textColor: "white"
        };
      case "Partial Match":
        return {
          gradientId: "gradient-partial",
          gradient: ["#f59e0b", "#d97706"],
          bgColor: "#f59e0b",
          textColor: "white"
        };
      default:
        return {
          gradientId: "gradient-poor",
          gradient: ["#ef4444", "#dc2626"],
          bgColor: "#ef4444",
          textColor: "white"
        };
    }
  };
  
  const style = getScoreStyle(qualityCategory);
  
  return (
    <div className="enhanced-match-score">
      <svg viewBox="0 0 64 64">
        <defs>
          <linearGradient id={style.gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={style.gradient[0]} />
            <stop offset="100%" stopColor={style.gradient[1]} />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke={`url(#${style.gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="score-content">
        <span className="score-text">{Math.round(percentage)}%</span>
        <span className="quality-label" style={{ color: style.bgColor }}>
          {qualityCategory}
        </span>
      </div>
    </div>
  );
}

// UI ENHANCEMENT – Component Breakdown Display
function ComponentBreakdown({ components }) {
  return (
    <div className="component-breakdown rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">Match Breakdown</h4>
      <div className="components-grid space-y-2">
        {components.map((comp, index) => (
          <div key={index} className="component-item rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="component-header mb-1.5 flex items-center justify-between">
              <span className="component-name text-sm font-medium text-slate-800">{comp.name}</span>
              <span className="component-weight text-xs text-slate-500">({Math.round(comp.weight * 100)}%)</span>
            </div>
            <div className="component-score-bar mb-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div 
                className="score-fill" 
                style={{ 
                  width: `${comp.score * 100}%`,
                  backgroundColor: comp.score >= 0.7 ? '#10b981' : 
                                  comp.score >= 0.5 ? '#3b82f6' : 
                                  comp.score >= 0.3 ? '#f59e0b' : '#ef4444'
                }}
              />
            </div>
            <div className="component-score-text mb-1 text-xs font-semibold text-slate-700">
              {Math.round(comp.score * 100)}%
            </div>
            <div className="component-explanation text-xs leading-relaxed text-slate-500">
              {comp.explanation}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// UI ENHANCEMENT – Skills Analysis Section
function SkillsAnalysis({ skillsAnalysis, matchingSkills, missingSkills }) {
  return (
    <div className="skills-analysis rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">Skills Analysis</h4>
      <div className="skills-summary mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="skills-metric rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <span className="metric-label mb-0.5 block text-xs text-slate-500">Coverage:</span>
          <span className="metric-value text-sm font-semibold text-slate-800">{skillsAnalysis.coverage}</span>
        </div>
        <div className="skills-metric rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <span className="metric-label mb-0.5 block text-xs text-slate-500">Context:</span>
          <span className="metric-value text-sm font-semibold text-slate-800">{skillsAnalysis.context}</span>
        </div>
        <div className="skills-metric rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <span className="metric-label mb-0.5 block text-xs text-slate-500">Relevant Skills:</span>
          <span className="metric-value text-sm font-semibold text-slate-800">{skillsAnalysis.relevant_count}</span>
        </div>
      </div>
      
      {matchingSkills.length > 0 && (
        <div className="skills-section mb-3">
          <div className="skills-section-header mb-2 flex items-center gap-2">
            <span className="icon icon-match inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
              <CheckCircle2 size={12} />
            </span>
            <span className="label text-xs font-semibold uppercase tracking-wide text-slate-600">Matching Skills</span>
            <span className="count ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{matchingSkills.length}</span>
          </div>
          <div className="skills-tags flex flex-wrap gap-1.5">
            {matchingSkills.slice(0, 8).map((skill, idx) => (
              <span key={idx} className="skill-tag match rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">{skill}</span>
            ))}
            {matchingSkills.length > 8 && (
              <span className="skill-tag rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">+{matchingSkills.length - 8}</span>
            )}
          </div>
        </div>
      )}
      
      {missingSkills.length > 0 && (
        <div className="skills-section">
          <div className="skills-section-header mb-2 flex items-center gap-2">
            <span className="icon icon-missing inline-flex h-5 w-5 items-center justify-center rounded-md bg-rose-100 text-rose-700">
              <Circle size={10} />
            </span>
            <span className="label text-xs font-semibold uppercase tracking-wide text-slate-600">Missing Skills</span>
            <span className="count ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{missingSkills.length}</span>
          </div>
          <div className="skills-tags flex flex-wrap gap-1.5">
            {missingSkills.slice(0, 6).map((skill, idx) => (
              <span key={idx} className="skill-tag missing rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700">{skill}</span>
            ))}
            {missingSkills.length > 6 && (
              <span className="skill-tag missing rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">+{missingSkills.length - 6}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// UI ENHANCEMENT – Experience Analysis Section
function ExperienceAnalysis({ experienceAnalysis }) {
  return (
    <div className="experience-analysis rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">Experience Analysis</h4>
      <div className="experience-details grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="experience-item rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <span className="label mb-0.5 block text-xs text-slate-500">Alignment:</span>
          <span className="value text-sm font-semibold text-slate-800">{experienceAnalysis.alignment}</span>
        </div>
        <div className="experience-item rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <span className="label mb-0.5 block text-xs text-slate-500">Context Strength:</span>
          <span className="value text-sm font-semibold text-slate-800">{experienceAnalysis.context_strength}</span>
        </div>
      </div>
    </div>
  );
}

// UI ENHANCEMENT – Enhanced Match Explanation Card
function EnhancedMatchCard({ result, onPreview }) {
  return (
    <article className="enhanced-result-card rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-all duration-200 ease-in-out hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
      <div className="card-header-enhanced flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5">
        <div className="candidate-info min-w-0 flex-1">
          <h4 className="candidate-name truncate text-base font-semibold text-slate-900" title={result.original_name}>
            {result.original_name}
          </h4>
          {result.experience_years != null && (
            <div className="candidate-meta mt-2">
              <span className="experience-badge inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                <Briefcase size={12} />
                {result.experience_years} years experience
              </span>
            </div>
          )}
        </div>
        <EnhancedMatchScore 
          percentage={result.match_percentage || 0} 
          qualityCategory={result.quality_category}
        />
      </div>
      
      <div className="card-body-enhanced space-y-3 p-5">
        {/* Match Summary */}
        <div className="match-summary rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3">
          <div className="summary-text text-sm font-medium leading-relaxed text-sky-800">{result.explanation.summary}</div>
        </div>
        
        {/* Component Breakdown */}
        <ComponentBreakdown components={result.explanation.components} />
        
        {/* Skills Analysis */}
        <SkillsAnalysis 
          skillsAnalysis={result.explanation.skills_analysis}
          matchingSkills={result.matching_skills || []}
          missingSkills={result.missing_skills || []}
        />
        
        {/* Experience Analysis */}
        <ExperienceAnalysis experienceAnalysis={result.explanation.experience_analysis} />
        
        {/* Role Analysis */}
        <div className="role-analysis rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-900">Role Analysis</h4>
          <div className="role-match-text rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            {result.explanation.role_match}
          </div>
        </div>
        
        <div className="result-card-actions pt-1">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-sm font-semibold text-blue-700 transition-all duration-200 hover:bg-blue-600 hover:text-white"
            onClick={() => onPreview(result)}
          >
            View Resume
          </button>
        </div>
      </div>
    </article>
  );
}

// UI ENHANCEMENT – Enhanced Match Results Component
const EnhancedMatchResults = React.memo(function EnhancedMatchResults({ 
  results, 
  onPreview, 
  previewResume, 
  onClosePreview 
}) {
  // PERFORMANCE OPTIMIZATION – Memoize sorted results
  const { matchedResults, unmatchedResults } = useMemo(() => {
    const allResults = [...results];
    const matched = allResults
      .filter(r => r.is_matched !== false)
      .sort((a, b) => (b.match_percentage || 0) - (a.match_percentage || 0));
    const unmatched = allResults
      .filter(r => r.is_matched === false)
      .sort((a, b) => (b.match_percentage || 0) - (a.match_percentage || 0));
    return { matchedResults: matched, unmatchedResults: unmatched };
  }, [results]);

  return (
    <section className="enhanced-match-results mt-6">
      {/* MATCHING RESUMES SECTION */}
      {matchedResults.length > 0 && (
        <div className="matching-section">
          <div className="match-results-header mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-lg font-semibold text-slate-900">Qualified Candidates</h2>
            <span className="results-count rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {matchedResults.length} qualified candidate{matchedResults.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="results-grid-enhanced grid grid-cols-1 gap-5 xl:grid-cols-2">
            {matchedResults.map((r, i) => (
              <EnhancedMatchCard 
                key={`matched-${i}`} 
                result={r} 
                onPreview={onPreview} 
              />
            ))}
          </div>
        </div>
      )}

      {/* NOT MATCHING RESUMES SECTION */}
      {unmatchedResults.length > 0 && (
        <div className="not-matching-section mt-8">
          <div className="match-results-header mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-lg font-semibold text-slate-900">Not Qualified</h2>
            <span className="results-count rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {unmatchedResults.length} not qualified candidate{unmatchedResults.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="results-grid grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {unmatchedResults.map((r, i) => (
              <article
                key={`unmatched-${i}`}
                className="result-card rounded-2xl border border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_10px_26px_rgba(15,23,42,0.12)]"
              >
                <div className="card-header-premium flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4">
                  <div className="candidate-info min-w-0 flex-1">
                    <h4 className="candidate-name truncate text-sm font-semibold text-slate-900" title={r.original_name}>
                      {r.original_name}
                    </h4>
                    {r.experience_years != null && (
                      <div className="candidate-meta mt-2">
                        <span className="experience-badge inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          <Briefcase size={11} />
                          {r.experience_years} years experience
                        </span>
                      </div>
                    )}
                  </div>
                  <EnhancedMatchScore 
                    percentage={r.match_percentage || 0} 
                    qualityCategory={r.quality_category || "Not Suitable"}
                  />
                </div>
                
                <div className="card-body space-y-3 p-4">
                  <div className="rejection-reason rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <div className="skills-section-header mb-1.5 flex items-center gap-2">
                      <span className="icon icon-missing inline-flex h-5 w-5 items-center justify-center rounded-md bg-rose-100 text-rose-700">
                        <XCircle size={12} />
                      </span>
                      <span className="label text-xs font-semibold uppercase tracking-wide text-rose-700">Not Qualified</span>
                    </div>
                    <div className="rejection-text text-sm text-rose-800">
                      {r.explanation?.summary || "Does not meet qualification criteria"}
                    </div>
                  </div>
                  
                  <button 
                    type="button" 
                    className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-sm font-semibold text-blue-700 transition-all duration-200 hover:bg-blue-600 hover:text-white"
                    onClick={() => onPreview(r)}
                  >
                    View Resume
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {results.length === 0 && (
        <div className="no-results mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="m-0 text-sm text-slate-500">No resumes to display</p>
        </div>
      )}
      
      {previewResume && (
        <ResumePreviewModal 
          resume={previewResume} 
          onClose={onClosePreview} 
          highlightKeywords={previewResume.matching_skills || []}
        />
      )}
    </section>
  );
});

export default EnhancedMatchResults;
