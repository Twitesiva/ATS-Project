export default function SearchFilters({ filters, onChange, onApply, loading }) {
  const update = (key, value) => onChange({ ...filters, [key]: value });

  // UI SORTING – NON-BREAKING CHANGE: Location options sorted alphabetically (A → Z) for better usability
  const locationOptions = [
    { value: "Ahmedabad", label: "Ahmedabad" },
    { value: "Aurangabad", label: "Aurangabad" },
    { value: "Bangalore", label: "Bangalore / Bengaluru" },
    { value: "Belgaum", label: "Belgaum / Belagavi" },
    { value: "Bhopal", label: "Bhopal" },
    { value: "Bhubaneswar", label: "Bhubaneswar" },
    { value: "Bihar", label: "Bihar" },
    { value: "Chandigarh", label: "Chandigarh" },
    { value: "Chennai", label: "Chennai" },
    { value: "Chhattisgarh", label: "Chhattisgarh" },
    { value: "Coimbatore", label: "Coimbatore" },
    { value: "Cuttack", label: "Cuttack" },
    { value: "Davangere", label: "Davangere" },
    { value: "Dehradun", label: "Dehradun" },
    { value: "Delhi", label: "Delhi" },
    { value: "Delhi NCR", label: "Delhi NCR (Noida, Gurgaon, Ghaziabad, etc.)" },
    { value: "Erode", label: "Erode" },
    { value: "Faridabad", label: "Faridabad" },
    { value: "Ghaziabad", label: "Ghaziabad" },
    { value: "Gujarat", label: "Gujarat" },
    { value: "Guntur", label: "Guntur" },
    { value: "Gurgaon", label: "Gurgaon / Gurugram" },
    { value: "Guwahati", label: "Guwahati" },
    { value: "Haryana", label: "Haryana" },
    { value: "Himachal Pradesh", label: "Himachal Pradesh" },
    { value: "Hosur", label: "Hosur" },
    { value: "Hubli", label: "Hubli / Hubballi" },
    { value: "Hyderabad", label: "Hyderabad" },
    { value: "Indore", label: "Indore" },
    { value: "Jaipur", label: "Jaipur" },
    { value: "Jharkhand", label: "Jharkhand" },
    { value: "Karnataka", label: "Karnataka" },
    { value: "Karimnagar", label: "Karimnagar" },
    { value: "Kerala", label: "Kerala" },
    { value: "Kochi", label: "Kochi / Cochin" },
    { value: "Kolhapur", label: "Kolhapur" },
    { value: "Kolkata", label: "Kolkata" },
    { value: "Kozhikode", label: "Kozhikode / Calicut" },
    { value: "Lucknow", label: "Lucknow" },
    { value: "Madhya Pradesh", label: "Madhya Pradesh" },
    { value: "Madurai", label: "Madurai" },
    { value: "Maharashtra", label: "Maharashtra" },
    { value: "Mangalore", label: "Mangalore / Mangaluru" },
    { value: "Mohali", label: "Mohali" },
    { value: "Mumbai", label: "Mumbai / Navi Mumbai" },
    { value: "Mysore", label: "Mysore / Mysuru" },
    { value: "Nagpur", label: "Nagpur" },
    { value: "Nashik", label: "Nashik" },
    { value: "Nellore", label: "Nellore" },
    { value: "Noida", label: "Noida / Greater Noida" },
    { value: "Odisha", label: "Odisha" },
    { value: "Patna", label: "Patna" },
    { value: "Pune", label: "Pune" },
    { value: "Punjab", label: "Punjab" },
    { value: "Raipur", label: "Raipur" },
    { value: "Rajasthan", label: "Rajasthan" },
    { value: "Ranchi", label: "Ranchi" },
    { value: "Salem", label: "Salem" },
    { value: "Solapur", label: "Solapur" },
    { value: "Tamil Nadu", label: "Tamil Nadu" },
    { value: "Telangana", label: "Telangana" },
    { value: "Thane", label: "Thane" },
    { value: "Thrissur", label: "Thrissur" },
    { value: "Thoothukudi", label: "Thoothukudi" },
    { value: "Tirunelveli", label: "Tirunelveli" },
    { value: "Trichy", label: "Trichy / Tiruchirappalli" },
    { value: "Trivandrum", label: "Trivandrum / Thiruvananthapuram" },
    { value: "Tumkur", label: "Tumkur" },
    { value: "Udaipur", label: "Udaipur" },
    { value: "Uttar Pradesh", label: "Uttar Pradesh" },
    { value: "Uttarakhand", label: "Uttarakhand" },
    { value: "Vellore", label: "Vellore" },
    { value: "Vijayawada", label: "Vijayawada" },
    { value: "Visakhapatnam", label: "Visakhapatnam / Vizag" },
    { value: "Warangal", label: "Warangal" },
    { value: "West Bengal", label: "West Bengal" },
  ];

  return (
    <section className="search-filters">
      <div className="filters-row">
        <div className="form-group">
          <label htmlFor="filter-phone">Phone Number</label>
          <input
            id="filter-phone"
            type="text"
            placeholder="e.g. 98765 or +91..."
            value={filters.phoneNumber}
            onChange={(e) => update("phoneNumber", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="filter-location">Location</label>
          <select
            id="filter-location"
            value={filters.location}
            onChange={(e) => update("location", e.target.value)}
          >
            <option value="">All locations</option>
            {/* FILTER CLEANUP – NON-BREAKING CHANGE: Removed broad and work-mode options (India, Pan India, Bharat, Remote, Hybrid, Onsite) */}
            {locationOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="filter-role">Role Search</label>
          <input
            id="filter-role"
            type="text"
            placeholder="e.g. Java Developer, Python Developer"
            value={filters.roleFilter || ""}
            onChange={(e) => update("roleFilter", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="filter-skills">Skills (comma-separated)</label>
          <input
            id="filter-skills"
            type="text"
            placeholder="e.g. Python, React"
            value={filters.skills}
            onChange={(e) => update("skills", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Match</label>
          <select
            value={filters.skillsMode}
            onChange={(e) => update("skillsMode", e.target.value)}
          >
            <option value="any">ANY skill</option>
            <option value="all">ALL skills</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="filter-exp">Experience (years)</label>
          <input
            id="filter-exp"
            type="number"
            min="0"
            step="0.5"
            placeholder="Min years"
            value={filters.experienceYears}
            onChange={(e) => update("experienceYears", e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={onApply} disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
      </div>
    </section>
  );
}
