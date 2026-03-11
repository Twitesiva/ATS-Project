import React, { useMemo } from "react";
import ResumePreviewModal from "./ResumePreviewModal";

// UI ENHANCEMENT – NON-BREAKING: Circular Progress Component for Match Score
function MatchScoreCircle({ percentage }) {
  const getScoreCategory = (score) => {
    if (score >= 70) return "high";
    if (score >= 50) return "medium";
    return "low";
  };

  const getScoreLabel = (category) => {
    if (category === "high") return "GOOD MATCH";
    if (category === "medium") return "PARTIAL MATCH";
    return "LOW MATCH";
  };

  const category = getScoreCategory(percentage || 0);
  const safePercentage = Math.max(0, Math.min(100, Math.round(percentage || 0)));

  return (
    <div className={`match-status-badge ${category}`}>
      <span className="match-status-percentage">{safePercentage}%</span>
      <span className="match-status-label">{getScoreLabel(category)}</span>
    </div>
  );
}

// UI ENHANCEMENT – NON-BREAKING: Skeleton Loader for Results
function ResultCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-header" />
      <div className="skeleton skeleton-line" style={{ width: "80%" }} />
      <div className="skeleton skeleton-line" style={{ width: "60%" }} />
      <div className="skeleton skeleton-line" />
    </div>
  );
}

// PERFORMANCE OPTIMIZATION – SAFE: Wrap component with React.memo to prevent unnecessary re-renders
const MatchResults = React.memo(function MatchResults({ results, onPreview, previewResume, onClosePreview }) {
  // PERFORMANCE OPTIMIZATION – SAFE: Memoize sorted results to separate matched and unmatched
  const { matchedResults, unmatchedResults } = useMemo(() => {
    const allResults = [...results];
    const matched = allResults.filter(r => r.is_matched !== false).sort((a, b) => (b.match_percentage || 0) - (a.match_percentage || 0));
    const unmatched = allResults.filter(r => r.is_matched === false).sort((a, b) => (b.match_percentage || 0) - (a.match_percentage || 0));
    return { matchedResults: matched, unmatchedResults: unmatched };
  }, [results]);
  return (
    <section className="match-results">
      {/* MATCHING RESUMES SECTION */}
      {matchedResults.length > 0 && (
        <div className="matching-section">
          <div className="match-results-header">
            <h2 style={{ backgroundColor: '#4ade80', padding: '10px', borderRadius: '5px' }}>Matching Resumes</h2>
            <span className="results-count">{matchedResults.length} matching candidate{matchedResults.length !== 1 ? 's' : ''}</span>
          </div>
          
          <div className="results-grid">
            {matchedResults.map((r, i) => (
              <div key={`matched-${i}`} className="result-card">
                {/* UI ENHANCEMENT – NON-BREAKING: Premium card header with circular score */}
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
                  <MatchScoreCircle percentage={r.match_percentage || 0} />
                </div>
                
                <div className="card-body">
                  {/* UI ENHANCEMENT – NON-BREAKING: Enhanced Matching Skills Section */}
                  {(r.matching_skills || []).length > 0 && (
                    <div className="skills-section">
                      <div className="skills-section-header">
                        <span className="icon icon-match">✓</span>
                        <span className="label">Matching Skills</span>
                        <span className="count">{r.matching_skills.length}</span>
                      </div>
                      <div className="skills-tags">
                        {r.matching_skills.slice(0, 6).map((skill, idx) => (
                          <span key={idx} className="skill-tag">{skill}</span>
                        ))}
                        {r.matching_skills.length > 6 && (
                          <span className="skill-tag">+{r.matching_skills.length - 6}</span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* UI ENHANCEMENT – NON-BREAKING: Enhanced Missing Skills Section */}
                  {(r.missing_skills || []).length > 0 && (
                    <div className="skills-section">
                      <div className="skills-section-header">
                        <span className="icon icon-missing">○</span>
                        <span className="label">Missing Skills</span>
                        <span className="count">{r.missing_skills.length}</span>
                      </div>
                      <div className="skills-tags">
                        {r.missing_skills.slice(0, 4).map((skill, idx) => (
                          <span key={idx} className="skill-tag missing">{skill}</span>
                        ))}
                        {r.missing_skills.length > 4 && (
                          <span className="skill-tag missing">+{r.missing_skills.length - 4}</span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <button type="button" className="btn btn-small btn-preview" onClick={() => onPreview(r)}>
                    View Resume
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NOT MATCHING RESUMES SECTION */}
      {unmatchedResults.length > 0 && (
        <div className="not-matching-section">
          <div className="match-results-header">
            <h2 style={{ backgroundColor: '#f87171', padding: '10px', borderRadius: '5px' }}>Not Matching Resumes</h2>
            <span className="results-count">{unmatchedResults.length} not matching candidate{unmatchedResults.length !== 1 ? 's' : ''}</span>
          </div>
          
          <div className="results-grid">
            {unmatchedResults.map((r, i) => (
              <div key={`unmatched-${i}`} className="result-card">
                {/* Card header for unmatched resumes */}
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
                  <MatchScoreCircle percentage={r.match_percentage || 0} />
                </div>
                
                <div className="card-body">
                  {/* Show reason for rejection */}
                  <div className="rejection-reason">
                    <div className="skills-section-header">
                      <span className="icon icon-missing">!</span>
                      <span className="label">Reason for rejection</span>
                    </div>
                    <div className="rejection-text">
                      {r.role_compatibility < 65 ? 'Role mismatch' : 'Low semantic score'}
                    </div>
                  </div>
                  
                  {/* Show all skills (though none match) */}
                  {(r.extracted_skills || []).length > 0 && (
                    <div className="skills-section">
                      <div className="skills-section-header">
                        <span className="icon icon-missing">○</span>
                        <span className="label">Extracted Skills</span>
                        <span className="count">{r.extracted_skills.length}</span>
                      </div>
                      <div className="skills-tags">
                        {r.extracted_skills.slice(0, 6).map((skill, idx) => (
                          <span key={idx} className="skill-tag missing">{skill}</span>
                        ))}
                        {r.extracted_skills.length > 6 && (
                          <span className="skill-tag missing">+{r.extracted_skills.length - 6}</span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <button type="button" className="btn btn-small btn-preview" onClick={() => onPreview(r)}>
                    View Resume
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Show message if no results at all */}
      {results.length === 0 && (
        <div className="no-results">
          <p>No resumes to display</p>
        </div>
      )}
      
      {previewResume && (
        // VISUAL EXTENSION – SAFE: Pass matching_skills to enable JD keyword highlighting in preview
        <ResumePreviewModal 
          resume={previewResume} 
          onClose={onClosePreview} 
          highlightKeywords={previewResume.matching_skills || []}
        />
      )}
    </section>
  );
});

export default MatchResults;


