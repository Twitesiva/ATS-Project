import React, { useMemo } from "react";
import ResumePreviewModal from "./ResumePreviewModal";

// UI ENHANCEMENT – Enhanced Score Display with Quality Categories
function EnhancedMatchScore({ percentage, qualityCategory }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const safePercentage = Math.max(0, Math.min(100, Math.round(percentage || 0)));
  const strokeDashoffset = circumference - (safePercentage / 100) * circumference;
  
  const getScoreStyle = (category) => {
    switch (category) {
      case "Excellent Match":
        return {
          gradientId: "gradient-excellent",
          gradient: ["#10b981", "#059669"],
          tone: "good",
          label: "GOOD MATCH"
        };
      case "Good Match":
        return {
          gradientId: "gradient-good",
          gradient: ["#22c55e", "#16a34a"],
          tone: "good",
          label: "GOOD MATCH"
        };
      case "Partial Match":
        return {
          gradientId: "gradient-partial",
          gradient: ["#f59e0b", "#d97706"],
          tone: "partial",
          label: "PARTIAL MATCH"
        };
      default:
        return {
          gradientId: "gradient-poor",
          gradient: ["#ef4444", "#dc2626"],
          tone: "low",
          label: "LOW MATCH"
        };
    }
  };
  
  const style = getScoreStyle(qualityCategory);
  
  return (
    <div className={`enhanced-match-score ${style.tone}`}>
      <svg viewBox="0 0 64 64">
        <defs>
          <linearGradient id={style.gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={style.gradient[0]} />
            <stop offset="100%" stopColor={style.gradient[1]} />
          </linearGradient>
        </defs>
        <circle className="enhanced-track" cx="32" cy="32" r={radius} />
        <circle
          className="enhanced-progress"
          cx="32"
          cy="32"
          r={radius}
          stroke={`url(#${style.gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="enhanced-score-content">
        <span className="enhanced-score-value">{safePercentage}%</span>
        <span className="enhanced-score-label">
          {style.label}
        </span>
      </div>
    </div>
  );
}

// UI ENHANCEMENT – Component Breakdown Display
function ComponentBreakdown({ components }) {
  return (
    <div className="component-breakdown">
      <h4 className="section-title">Match Breakdown</h4>
      <div className="components-grid">
        {components.map((comp, index) => (
          <div key={index} className="component-item">
            <div className="component-header">
              <span className="component-name">{comp.name}</span>
              <span className="component-weight">({Math.round(comp.weight * 100)}%)</span>
            </div>
            <div className="component-score-bar">
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
            <div className="component-score-text">
              {Math.round(comp.score * 100)}%
            </div>
            <div className="component-explanation">
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
    <div className="skills-analysis">
      <h4 className="section-title">Skills Analysis</h4>
      <div className="skills-summary">
        <div className="skills-metric">
          <span className="metric-label">Coverage:</span>
          <span className="metric-value">{skillsAnalysis.coverage}</span>
        </div>
        <div className="skills-metric">
          <span className="metric-label">Context:</span>
          <span className="metric-value">{skillsAnalysis.context}</span>
        </div>
        <div className="skills-metric">
          <span className="metric-label">Relevant Skills:</span>
          <span className="metric-value">{skillsAnalysis.relevant_count}</span>
        </div>
      </div>
      
      {matchingSkills.length > 0 && (
        <div className="skills-section">
          <div className="skills-section-header">
            <span className="icon icon-match">✓</span>
            <span className="label">Matching Skills</span>
            <span className="count">{matchingSkills.length}</span>
          </div>
          <div className="skills-tags">
            {matchingSkills.slice(0, 8).map((skill, idx) => (
              <span key={idx} className="skill-tag match">{skill}</span>
            ))}
            {matchingSkills.length > 8 && (
              <span className="skill-tag">+{matchingSkills.length - 8}</span>
            )}
          </div>
        </div>
      )}
      
      {missingSkills.length > 0 && (
        <div className="skills-section">
          <div className="skills-section-header">
            <span className="icon icon-missing">○</span>
            <span className="label">Missing Skills</span>
            <span className="count">{missingSkills.length}</span>
          </div>
          <div className="skills-tags">
            {missingSkills.slice(0, 6).map((skill, idx) => (
              <span key={idx} className="skill-tag missing">{skill}</span>
            ))}
            {missingSkills.length > 6 && (
              <span className="skill-tag missing">+{missingSkills.length - 6}</span>
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
    <div className="experience-analysis">
      <h4 className="section-title">Experience Analysis</h4>
      <div className="experience-details">
        <div className="experience-item">
          <span className="label">Alignment:</span>
          <span className="value">{experienceAnalysis.alignment}</span>
        </div>
        <div className="experience-item">
          <span className="label">Context Strength:</span>
          <span className="value">{experienceAnalysis.context_strength}</span>
        </div>
      </div>
    </div>
  );
}

// UI ENHANCEMENT – Enhanced Match Explanation Card
function EnhancedMatchCard({ result, onPreview }) {
  return (
    <div className="enhanced-result-card">
      <div className="card-header-enhanced">
        <div className="candidate-info">
          <h4 className="candidate-name" title={result.original_name}>
            {result.original_name}
          </h4>
          {result.experience_years != null && (
            <div className="candidate-meta">
              <span className="experience-badge">
                <span className="icon">💼</span>
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
      
      <div className="card-body-enhanced">
        {/* Match Summary */}
        <div className="match-summary">
          <div className="summary-text">{result.explanation.summary}</div>
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
        <div className="role-analysis">
          <h4 className="section-title">Role Analysis</h4>
          <div className="role-match-text">
            {result.explanation.role_match}
          </div>
        </div>
        
        <button 
          type="button" 
          className="btn btn-small btn-preview" 
          onClick={() => onPreview(result)}
        >
          View Resume
        </button>
      </div>
    </div>
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
    <section className="enhanced-match-results">
      {/* MATCHING RESUMES SECTION */}
      {matchedResults.length > 0 && (
        <div className="matching-section">
          <div className="match-results-header">
            <h2 className="section-title">Qualified Candidates</h2>
            <span className="results-count">
              {matchedResults.length} qualified candidate{matchedResults.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="results-grid-enhanced">
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
        <div className="not-matching-section">
          <div className="match-results-header">
            <h2 className="section-title">Not Qualified</h2>
            <span className="results-count">
              {unmatchedResults.length} not qualified candidate{unmatchedResults.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          <div className="results-grid">
            {unmatchedResults.map((r, i) => (
              <div key={`unmatched-${i}`} className="result-card">
                <div className="card-header-premium">
                  <div className="candidate-info">
                    <h4 className="candidate-name" title={r.original_name}>
                      {r.original_name}
                    </h4>
                    {r.experience_years != null && (
                      <div className="candidate-meta">
                        <span className="experience-badge">
                          <span className="icon">💼</span>
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
                
                <div className="card-body">
                  <div className="rejection-reason">
                    <div className="skills-section-header">
                      <span className="icon icon-missing">!</span>
                      <span className="label">Not Qualified</span>
                    </div>
                    <div className="rejection-text">
                      {r.explanation?.summary || "Does not meet qualification criteria"}
                    </div>
                  </div>
                  
                  <button 
                    type="button" 
                    className="btn btn-small btn-preview" 
                    onClick={() => onPreview(r)}
                  >
                    View Resume
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Results */}
      {results.length === 0 && (
        <div className="no-results">
          <p>No resumes to display</p>
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
