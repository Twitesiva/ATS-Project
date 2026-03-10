import ResumePreviewModal from "./ResumePreviewModal";

export default function ResumeTable({ resumes, onPreview, previewResume, onClosePreview, highlightKeywords }) {
  return (
    <section className="resume-table-section">
      <div className="table-header">
        <h2>Resumes <span className="count-badge">{resumes.length}</span></h2>
      </div>
      {resumes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p className="empty-msg">No resumes found.</p>
          <p className="empty-hint">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="resume-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone Number</th>
                <th>Experience</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((r) => (
                <tr key={r.resume_id}>
                  <td className="name-cell">
                    <div className="name-primary">{r.name}</div>
                    {r.location_display && <div className="name-secondary">📍 {r.location_display}</div>}
                  </td>
                  <td>
                    {r.phone_number_display ? (
                      <span className="phone-badge">📞 {r.phone_number_display}</span>
                    ) : (
                      <span className="phone-missing">—</span>
                    )}
                  </td>
                  <td>{r.experience_years != null ? `${r.experience_years} yrs` : "—"}</td>
                  <td>
                    <button type="button" className="btn btn-small btn-preview" onClick={() => onPreview(r)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {previewResume && (
        <ResumePreviewModal
          resume={{
            ...previewResume,
            matching_skills: previewResume.extracted_skills || previewResume.matching_skills,
            original_name: previewResume.name,
          }}
          onClose={onClosePreview}
          highlightKeywords={highlightKeywords}
        />
      )}
    </section>
  );
}
